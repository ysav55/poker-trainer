# AI Use in Poker Trainer

> **Bottom line**: No LLMs in production today. The app uses two deterministic AI systems — a rule-based hand analyzer and a combinatorial equity engine — plus an annotation layer that is the intended insertion point for future LLM features. All intelligence surfaces are gated behind coach auth.

---

## What "AI" Means Here

Three layers, in order of sophistication:

| Layer | What it is | Status |
|---|---|---|
| **Hand Analyzer** | 10 rule-based analyzers → auto-tags per hand | Live |
| **Equity Engine** | `poker-odds-calculator` → win % per player per street | Live |
| **Annotations** | Action-indexed free-text notes (REST API) | Live, LLM-ready |

No neural networks. No LLM API calls. Nothing non-deterministic.

---

## 1. Hand Analyzer

**Entry point:** `server/game/AnalyzerService.js`
**Registry:** `server/game/tagAnalyzers/index.js`

After every hand completes, `analyzeAndTagHand(handId)` runs automatically. It:

1. Fetches hand, actions, and player data in **one parallel round-trip** (`Promise.all`).
2. Attaches `sizingRatio` (bet ÷ pot) to every action.
3. Runs all 10 analyzers concurrently via `Promise.allSettled` — each has its own fault boundary; one crash doesn't kill the others.
4. Deduplicates + validates results, then atomically replaces tags in `hand_tags`.

### The 10 Analyzers

| File | Key Tags |
|---|---|
| `street.js` | WALK, SAW_FLOP/TURN/RIVER, WENT_TO_SHOWDOWN |
| `preflop.js` | 3BET_POT, FOUR_BET_POT, SQUEEZE_POT, LIMPED_POT, BTN_OPEN, BLIND_DEFENSE |
| `postflop.js` | C_BET, CHECK_RAISE, BLUFF_CATCH, DONK_BET, RIVER_RAISE |
| `potType.js` | WHALE_POT, MULTIWAY, SHORT_STACK, DEEP_STACK |
| `board.js` | MONOTONE_BOARD, PAIRED_BOARD |
| `mistakes.js` | OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, FOLD_TO_PROBE, MIN_RAISE |
| `sizing.js` | PROBE_BET, THIRD_POT_BET, HALF_POT_BET, POT_BET, OVERBET, OVERBET_JAM |
| `positional.js` | C_BET_IP, C_BET_OOP, DONK_BET_BB, 3BET_BTN, 3BET_SB |
| `handStrength.js` | SLOWPLAY, HERO_CALL, VALUE_MISSED, THIN_VALUE_RAISE |
| `equity.js` | DREW_THIN, VALUE_BACKED, EQUITY_BLUFF, EQUITY_FOLD |

The equity analyzer is the sharpest: it cross-references each action against the player's actual win probability at that street. DREW_THIN (called with <25% equity) and EQUITY_FOLD (folded with >50%) are the two mistakes coaches flag most.

**Extending the analyzer:** drop a new file in `server/game/tagAnalyzers/`, export `{ name, analyze(ctx) }`, add it to the registry array in `index.js`. The pipeline picks it up with no other changes.

---

## 2. Equity Engine

**File:** `server/game/EquityService.js`

Uses `poker-odds-calculator` (rundef/node-poker-odds-calculator) — pure combinatorial enumeration, no Monte Carlo approximation. Fires on:

- Hand start (`start_game`, `start_configured_game`)
- Every street advance or rollback
- Street transition on any bet action

Results are cached per table in `SharedState.equityCache`. The coach controls whether players see their win percentage — **off by default**.

The `EquityAnalyzer` (post-hand) recomputes equity from recorded hole cards independently; it does not read the live cache.

---

## 3. Annotations — the LLM Hook

**File:** `server/routes/annotations.js`

Annotations attach free-text notes to specific action indices in a hand replay:

```
GET  /api/hands/:handId/annotations
POST /api/hands/:handId/annotations   { action_index, text }
DEL  /api/annotations/:annotationId
```

All three require JWT auth. Deletion is author-only (coaches bypass).

This is the right insertion point for an LLM assistant. The `hand_annotations` table and `action_index` foreign key already exist. An LLM service would call this same POST endpoint server-side, tagged with a system `author_id`. **No schema migration needed.**

---

## 4. Coach vs Student Experience

**Coaches see everything. Students see what the coach allows.**

| Feature | Coach | Student |
|---|---|---|
| Equity % | Always (live, per-player) | Only if coach calls `toggle_equity_display` |
| Hole card ranges | Always | Only if coach calls `toggle_range_display` |
| Heatmaps | Always | Only if coach calls `toggle_heatmap_display` |
| Hand tags | Full hand library | Visible in replay |
| Annotations | Create + delete | Read-only |
| Mistake feed | All players | Own mistakes only |

`share_range` (socket event) broadcasts a hand-group range overlay to every player at the table mid-hand. It's the highest-leverage real-time coaching action in the current app — and the natural delivery mechanism for an LLM-suggested range.

---

## 5. Guards Against Bad Use

All intelligence surfaces sit behind layered gates:

1. **Closed auth system** — `players.csv` + bcrypt + JWT. No self-registration. No anonymous access.
2. **RBAC** — `requireCoach(socket, action)` guards every equity toggle, range share, and annotation mutation. Players cannot invoke these socket events.
3. **Server-side enforcement** — equity visibility settings live in `SharedState.equitySettings` on the server. There is no client-side flag to spoof.
4. **Input validation** — annotations require `action_index` (number) and non-empty `text`. Bet amounts and card strings are validated before touching game state.
5. **No client-side Supabase** — `client/src/lib/supabase.js` is a Proxy stub that throws on every access. All DB reads go through authenticated Express routes.

If we add an LLM, the same pattern holds: the LLM call runs server-side, inside a coach-guarded handler. Students never call the LLM directly.

---

## 6. What Is Already LLM-Ready

The architecture is clean for LLM integration with no rework:

- **Annotation POST endpoint** — a server-side LLM service POSTs notes. Students see them in replay. No UI changes.
- **`buildAnalyzerContext(handId)`** — returns a rich structured object: actions, positions, sizingRatios, equity, hole cards, board. This is the correct LLM prompt payload — structured enough to avoid prompt-engineering surprises.
- **Tag types** — adding `llm` to the `'auto' | 'mistake' | 'sizing'` union is one line. The display pipeline already reads `tag_type` for color-coding.
- **Hand history schema** — `hand_actions` (position, street, amount, pot_at_action) is already in the shape most poker AI models expect.

**The one missing piece:** a `server/ai/LlmClient.js` module and a `LLM_API_KEY` env var. Everything else is wired.

---

## 7. Recommended LLM Rollout (Opinionated)

Build in this order:

1. **Hand summary** — after `analyzeAndTagHand`, call the LLM with AnalyzerContext + existing tags. Get back 2–3 plain-English sentences. POST to annotations with `action_index: -1` (hand-level sentinel). Coaches see it in the hand library immediately. Cost: ~200 tokens/hand.

2. **Action-level mistake explanations** — for each `mistake` tag, generate one sentence: *"You called 450 into 600 with 18% equity — you need 43% to break even here."* POST at the tagged action's index. Visible in replay.

3. **Range advisor** — during a live hand, the coach requests a range suggestion for a spot. Server calls LLM → returns a hand-group array → coach approves → delivers via existing `share_range`. No new UI surface.

**Do not build a chat interface.** Coaches want the right data at the right moment, not a chatbot. Annotations and tags are the right delivery surface. A chat layer adds latency and hallucination risk without improving the coaching workflow.
