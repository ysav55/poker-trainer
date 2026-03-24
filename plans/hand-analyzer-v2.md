# Hand Analyzer v2 — Implementation Plan

## Goal
Rebuild `analyzeAndTagHand()` from a 230-line monolith into a modular, extensible tag engine.
Five orthogonal capabilities layered on top of each other in dependency order.

---

## Phase 0 — Bug Fixes + DB Migration
*Fix broken logic first. Ship migration before any analyzer code lands.*

### Bug fixes (inline with refactor, not separate commits)
| Bug | Fix |
|-----|-----|
| Action string duplication (`'raised'`/`'raise'` etc.) | Add `normalizeAction(str)` helper at top of file; all comparisons use it |
| OVERBET uses running total across all streets | Replaced by per-action `sizingRatio` in Phase 1; hand-level OVERBET rewritten |
| BLUFF_CATCH caller/bet mismatch | Rewrite: find last river bet, then find the *next* call after it, check caller is winner |
| DELETE + INSERT not atomic | Wrap in a single upsert or delete-then-insert inside a Supabase RPC; graceful catch restores |
| MIN_RAISE `amount` semantics | Confirmed raise-to; existing logic is correct — add a comment documenting this |

### Migration `006_hand_analyzer_v2.sql`
```sql
-- Per-action position context
ALTER TABLE hand_actions ADD COLUMN position VARCHAR(8);

-- Per-player/action tag targeting
ALTER TABLE hand_tags ADD COLUMN player_id UUID REFERENCES player_identities(player_id);
ALTER TABLE hand_tags ADD COLUMN action_id BIGINT REFERENCES hand_actions(id);
```
One atomic migration. Old rows get nulls — all new analyzers skip gracefully when data absent.

---

## Phase 1 — Context Builder + Position Infrastructure
*Build the shared foundation every analyzer will consume.*

### New file: `server/game/positions.js`
```js
// Offset from dealer seat (clockwise) → position name, by player count
const POSITION_NAMES = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};

// Returns position name for a player given seated array + dealerSeat
function getPosition(seated, dealerSeat, playerId) { ... }

// Returns { [playerId]: positionName } map for all seated players
function buildPositionMap(seated, dealerSeat) { ... }
```

### Update `recordAction` in `server/index.js`
- Compute `position` for the acting player via `getPosition(seated, dealerSeat, playerId)`
- Write it to the `hand_actions.position` column

### New function: `buildAnalyzerContext(handId)` in `HandLoggerSupabase.js`
Replaces the ad-hoc fetching scattered at the top of `analyzeAndTagHand`. Returns:

```js
{
  hand,           // hands row
  actions,        // non-reverted actions; each has .sizingRatio = amount / potAtAction
                  //   (null if potAtAction is 0 or null)
  byStreet,       // actions grouped by street key
  seated,         // hand_players sorted by seat
  positions,      // { [playerId]: 'BTN'|'SB'|... } built from buildPositionMap()
  bbPlayerId,     // from existing _findBBPlayerId()
  potByStreet,    // { preflop, flop, turn, river } = potAtAction of first action on that street
                  //   null-fallback: sum amounts from prior streets
  evaluateAt,     // (playerId, street) → HandResult | null
                  //   reads hole_cards from hand_players; slices board to 3/4/5 cards
                  //   returns null if hole_cards missing or board insufficient
}
```

`sizingRatio` null-safe: if `potAtAction` is 0 or null, ratio is null and sizing analyzers skip that action.

---

## Phase 2 — Registry + Existing Tag Migration
*Extract all current tags into analyzer objects. analyzeAndTagHand becomes a runner.*

### New directory: `server/game/tagAnalyzers/`
Each file exports an analyzer object:
```js
// Example shape
export const WalkAnalyzer = {
  name: 'WalkAnalyzer',
  analyze(ctx) {
    // returns array of tag result objects (empty array = no tags)
    return [];
  }
};

// Tag result shape:
// { tag, tag_type: 'auto'|'mistake'|'sizing', player_id?: UUID, action_id?: number }
```

### Analyzer files (existing tags ported)
| File | Tags covered |
|------|-------------|
| `street.js` | WALK, SAW_FLOP, SAW_TURN, SAW_RIVER, WENT_TO_SHOWDOWN |
| `preflop.js` | 3BET_POT, FOUR_BET_POT, SQUEEZE_POT, ALL_IN_PREFLOP, LIMPED_POT, BTN_OPEN, BLIND_DEFENSE |
| `postflop.js` | C_BET, CHECK_RAISE, DONK_BET, RIVER_RAISE, BLUFF_CATCH (fixed) |
| `potType.js` | WHALE_POT (fixed), MULTIWAY, SHORT_STACK, DEEP_STACK, OVERBET (fixed) |
| `board.js` | MONOTONE_BOARD, PAIRED_BOARD |
| `mistakes.js` | OPEN_LIMP (now player-tagged), MIN_RAISE (now player-tagged), UNDO_USED |

### New `analyzeAndTagHand` body
```js
async function analyzeAndTagHand(handId) {
  const ctx = await buildAnalyzerContext(handId);
  if (!ctx) return;

  const results = [];
  for (const analyzer of ANALYZER_REGISTRY) {
    results.push(...analyzer.analyze(ctx));
  }

  // Atomic delete + re-insert (auto + mistake + sizing; leave coach alone)
  await writeTagResults(handId, results);

  return results;
}
```

---

## Phase 3 — Sizing Tags
*Per-action bet sizing classification. Player-tagged.*

### New file: `server/game/tagAnalyzers/sizing.js`
One analyzer, emits one sizing tag per applicable action (bets and raises only).

```
sizingRatio < 0.25       →  PROBE_BET
0.25 – 0.49              →  THIRD_POT_BET
0.50 – 0.79              →  HALF_POT_BET
0.80 – 1.10              →  POT_BET
1.10 – 2.00              →  OVERBET
> 2.00                   →  OVERBET_JAM
```

Tag result: `{ tag, tag_type: 'sizing', player_id, action_id }`

Actions with null `sizingRatio` (missing potAtAction) are skipped silently.
Only fires on `bet`, `raise`/`raised` actions — not calls or checks.

---

## Phase 4 — Extended Mistake Tags
*Player-level mistake detection with position context.*

### Additions to `server/game/tagAnalyzers/mistakes.js`

| Tag | Condition | Player-tagged? |
|-----|-----------|---------------|
| `LIMP_RERAISE` | Player called preflop before a raise, then raised after being raised | ✅ |
| `COLD_CALL_3BET` | Player called a 3-bet with no prior investment in the pot | ✅ |
| `FOLD_TO_PROBE` | Player folded to a bet with sizingRatio < 0.25 | ✅ |
| `OVERLIMP` | Player called preflop when at least one other player had already limped | ✅ |
| `OPEN_LIMP` | (existing — now player-tagged) | ✅ |
| `MIN_RAISE` | (existing — now player-tagged) | ✅ |

All tags carry `player_id`. `FOLD_TO_PROBE` also carries `action_id` of the fold action.

---

## Phase 5 — Positional Tags
*Position-qualified variants of existing action tags.*

### New file: `server/game/tagAnalyzers/positional.js`

| Tag | Condition |
|-----|-----------|
| `C_BET_IP` | C-bet and PFR has position on caller |
| `C_BET_OOP` | C-bet and PFR is out of position |
| `DONK_BET_BB` | Donk bet specifically by the BB (most common / most instructive) |
| `3BET_BTN` | 3-bet made from BTN position |
| `3BET_SB` | 3-bet made from SB position |
| `SQUEEZE_CO` | Squeeze from CO (common training spot) |
| `BTN_OPEN` | (existing — now also player-tagged with position confirmed as BTN) |

Position is read from `ctx.positions[playerId]` — always available from Phase 1.
IP/OOP determined by comparing clockwise offsets from dealer seat.

---

## Phase 6 — Hand Strength Tags
*Outcome-aware tags using HandEvaluator. Most coaching-dense phase.*

### New file: `server/game/tagAnalyzers/handStrength.js`

Uses `ctx.evaluateAt(playerId, street)` → `{ rank, rankName, ... } | null`

**Strength tiers:**
```
rank 0   HIGH_CARD      → weak
rank 1   ONE_PAIR       → marginal
rank 2   TWO_PAIR       → strong
rank 3+  SET and above  → monster
```

| Tag | Condition | Notes |
|-----|-----------|-------|
| `SLOWPLAY` | rank ≥ 3 on flop or turn; player never bet or raised that street | Player-tagged |
| `HERO_CALL` | Called river bet with rank ≤ 1; outcome via `hand_players.is_winner` | Player-tagged + action_id |
| `VALUE_MISSED` | rank ≥ 2 on every postflop street; player never bet or raised postflop | Only fires if player saw flop |
| `THIN_VALUE_RAISE` | Raised on river with rank == 1 | Player-tagged + action_id |

All four skip gracefully if `evaluateAt` returns null (old hands, missing hole cards).

---

## Dependency Graph

```
Phase 0 (bugs + migration)
    └── Phase 1 (context builder + positions.js)
            └── Phase 2 (registry + existing tags ported)
                    ├── Phase 3 (sizing tags)       ← needs sizingRatio from Phase 1
                    ├── Phase 4 (mistake tags)      ← needs positions from Phase 1
                    ├── Phase 5 (positional tags)   ← needs positions from Phase 1
                    └── Phase 6 (hand strength)     ← needs evaluateAt from Phase 1
                                                       Phases 3–5 can ship in any order
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `server/game/positions.js` | Position name lookup + buildPositionMap() |
| `server/game/tagAnalyzers/street.js` | Street progression tags |
| `server/game/tagAnalyzers/preflop.js` | Preflop action tags |
| `server/game/tagAnalyzers/postflop.js` | Postflop action tags |
| `server/game/tagAnalyzers/potType.js` | Pot characterization tags |
| `server/game/tagAnalyzers/board.js` | Board texture tags |
| `server/game/tagAnalyzers/mistakes.js` | Mistake tags (player-tagged) |
| `server/game/tagAnalyzers/sizing.js` | Bet sizing tags (Phase 3) |
| `server/game/tagAnalyzers/positional.js` | Position-qualified tags (Phase 5) |
| `server/game/tagAnalyzers/handStrength.js` | Hand strength tags (Phase 6) |
| `supabase/migrations/006_hand_analyzer_v2.sql` | Schema changes |

## Modified Files Summary

| File | Change |
|------|--------|
| `server/db/HandLoggerSupabase.js` | Replace analyzeAndTagHand body; add buildAnalyzerContext; add writeTagResults |
| `server/index.js` | recordAction writes position column |

---

## What Does NOT Change
- `hand_tags.tag_type` enum values (`auto`, `mistake`, `coach`) — `sizing` is a new value added in migration
- Coach tag flow (`updateCoachTags`) — untouched
- Playlist/tag UI — tags are still strings; new tags appear automatically
- SessionReport.js — picks up new tags automatically via existing tag-rendering loop
- All existing tests — existing tag names unchanged; new tags are additive
