# Refactor Plan 02 — Game Engine

> Status: PROPOSED — not yet started
> Scope: `server/game/GameManager.js` (1,369 lines), `SessionManager.js` (280 lines), `positions.js`, `Deck.js`, `SidePotCalculator.js`
> Live-safe: yes — full backwards-compat strategy included

---

## 1. Current State Audit

### 1.1 Overall Structure

`GameManager` is a single class across 1,369 lines with no internal module boundaries. Logical sections are separated only by ASCII banner comments:

| Lines (approx) | Section |
|---|---|
| 1–83 | `_initState()` — flat mutable state object |
| 84–187 | `getPublicState()` — projection + sanitisation |
| 188–271 | Player management (`addPlayer`, `removePlayer`, seat helpers) |
| 272–378 | Replay helpers (`_applyReplayAction`, `_buildReplayStateAtCursor`) |
| 379–470 | History/undo (`_saveSnapshot`, `undoAction`, `rollbackStreet`) |
| 471–641 | Config phase + `startGame()` |
| 642–785 | Betting round (`placeBet`, `_isBettingRoundOver`, `_nextTurn`, `_postBlind`) |
| 786–1007 | Showdown resolution + `_advanceStreet()` |
| 1008–1167 | Coach controls (pause, mode, blinds, pot award, reset, stack adjust) |
| 1168–1354 | Replay mode public API (load, step, branch, unbranch, exit) |
| 1355–1369 | Side-pot utility helper (`_sortWinnersBySBProximity`) |

### 1.2 State Representation

The `this.state` object (defined in `_initState()`, lines 35–82) is a large flat plain-JS object with ~30 top-level keys. Notable issues:

- **Deeply nested sub-objects with no type enforcement.** `replay_mode` (11 keys), `playlist_mode` (4 keys), and individual player objects (20+ keys each) are plain JS objects with no schema validation layer.
- **Internal vs external keys intermixed.** `_full_board`, `last_raise_was_full`, `last_aggressor`, and `is_replay_branch` are internal bookkeeping fields living alongside display fields like `phase` and `winner_name`. The leading-underscore convention is applied inconsistently (`_full_board` uses it; `last_raise_was_full` does not).
- **Mutable players array accessed directly.** Every mutation reaches into array elements by reference. The test suite regularly assigns directly to `gm.state.players[i].stack`.
- **History snapshots via `JSON.parse(JSON.stringify(this.state))` (line 331).** Deep clone on every action for undo. Fragile (no schema evolution safety) and wasteful when only 1–2 fields changed.
- **`is_replay_branch` duplicates `replay_mode.branched`.** Two flags for the same conceptual state create divergence risk.

### 1.3 What Is Mixed Together (12 distinct responsibilities)

1. Game phase state (preflop → showdown lifecycle)
2. Betting round logic (action validation, min-raise tracking, turn advancement)
3. Blind rotation (dealer seat, SB/BB assignment, `_postBlind`)
4. Player seat management (add/remove, in-hand flag, disconnection flag)
5. Card dealing (deck draw, config/hybrid card assignment)
6. Showdown resolution (hand comparison, pot splitting, remainder chip rules)
7. Undo/redo history (snapshot management, rollback)
8. Coach controls (pause, mode override, stack adjust, force-street)
9. Guided replay state machine (load, step, branch, unbranch)
10. Playlist navigation state (advance, seek, deactivate)
11. Config phase (hand configuration, `generateHand` integration)
12. Public state projection + card hiding (`getPublicState`)

---

## 2. State Management Recommendation

### Options Evaluated

**A. Immutable updates (immer / manual spread)** — Every mutation returns a new state object. Costs: major rewrite of ~80 mutation sites; the snapshot system already handles undo.

**B. Event sourcing** — Append-only log of events; derive state by replay. Costs: the existing DB-backed `hand_actions` table already fills this role for cross-session replay. Duplicating it in-memory adds complexity.

**C. XState formal state machine** — Encode `phase` transitions explicitly. Costs: hard-to-justify third-party dependency; the transition graph (preflop → flop → turn → river → showdown) is simple enough to validate without a framework.

**D. Structural discipline within the current mutable model (recommended)** — Keep mutable plain-JS object but impose three rules:
1. All mutations happen inside named methods on `GameManager` or extracted sub-classes, never via direct property assignment from outside.
2. Separate internal-only fields (prefix `_`) from the public state contract explicitly in `_initState`.
3. `getPublicState()` is the only egress for state; no consumer reads `gm.state.*` directly.

Recommendation D preserves the working 918-test suite, requires no new dependencies, and allows incremental adoption. It positions the codebase for a future XState migration once sub-concern extraction is complete.

---

## 3. Pure vs Impure Functions

### Pure (no side-effects, no `this.state` mutation)

| Method | Notes |
|---|---|
| `_isBettingRoundOver()` | Reads state, returns boolean. Could be a standalone function. |
| `_sortWinnersBySBProximity()` | Pure sort; reads seat data. |
| `getPublicState()` | Returns a projection. However it has a subtle bug: mutates `players[i].hole_cards` in-place during replay (lines 106–110). |
| `_gamePlayers()` | Pure filter. |

### Impure but Deterministic Mutations (no I/O, no randomness)

| Method | Notes |
|---|---|
| `_postBlind()` | Mutates player + pot. Could take player+state as arguments and return deltas. |
| `_nextTurn()` | Mutates `current_turn`. |
| `_advanceStreet()` | Deals cards (pure in manual mode; calls `deck.pop()` in RNG mode), mutates phase, resets per-street state. |
| `undoAction()` / `rollbackStreet()` | State replacement from snapshot — deterministic. |
| `_applyReplayAction()` | Applies one recorded action — deterministic given input. |
| `_buildReplayStateAtCursor()` | Iterative replay up to cursor — deterministic. |

### Impure and Non-Deterministic

| Method | Notes |
|---|---|
| `startGame()` (RNG path) | Calls `shuffleDeck(createDeck())` — random. |
| `_resolveShowdown()` | Calls `evaluate()` / `compareHands()` — pure functions, but mutates player stacks. |

### Extraction Targets (pure functions)

- `bettingRound.js`: `isBettingRoundOver(activePlayers, currentBet)`, `computeNextTurn(players, fromId)`, `validateRaise(state, amount)`
- `showdownResolver.js`: `resolveShowdown(activePlayers, allPlayers, board)` → returns `{ showdown_result, stackDeltas }` without mutating players
- `blindManager.js`: `assignBlinds(players, dealerIdx)` → returns position assignments; `computeBlindPost(player, amount)` → returns `{ paid, isAllIn }`

---

## 4. GameManager Responsibilities — Extraction Proposals

### 4.1 `BlindManager`

Encapsulate dealer rotation, SB/BB assignment, blind posting.

Current location: `startGame()` lines 572–593, `_postBlind()` lines 644–655, `resetForNextHand()` lines 1100–1109.

Proposed interface:
```
BlindManager.assignPositions(players, dealerSeat) → { dealerIdx, sbIdx, bbIdx }
BlindManager.postBlinds(players, sbIdx, bbIdx, sb, bb) → { pot, stackDeltas, allInsOnBlind }
BlindManager.advanceDealerSeat(players, currentSeat) → nextSeat
```

### 4.2 `BettingRound`

Encapsulate the within-street action loop: validation, turn advancement, round completion check.

Current location: `placeBet()` lines 660–762, `_isBettingRoundOver()` lines 764–769, `_nextTurn()` lines 772–785.

Proposed interface:
```
BettingRound.validateAction(state, playerId, action, amount) → { error } | { ok }
BettingRound.applyAction(player, state, action, amount) → stackDelta
BettingRound.isRoundOver(players, currentBet) → boolean
BettingRound.findNextActingPlayer(players, fromId) → playerId | null
```

### 4.3 `ShowdownResolver`

Encapsulate hand evaluation, side pot splitting, remainder chip distribution.

Current location: `_resolveShowdown()` lines 787–904, `_sortWinnersBySBProximity()` lines 1356–1366.

Proposed interface:
```
ShowdownResolver.resolve(activePlayers, allPlayers, board) → ShowdownResult
ShowdownResolver.resolveWithSidePots(activePlayers, allPlayers, board) → ShowdownResult
```

### 4.4 `ReplayEngine`

Extract the entire replay state machine into its own class. It has its own lifecycle (load → step → branch → exit) orthogonal to the live game.

Current location: lines 276–325 (helpers), lines 1172–1354 (public API).

Proposed: `ReplayEngine` class with `load(handDetail)`, `stepForward()`, `stepBack()`, `jumpTo(cursor)`, `branch()`, `unbranch()`, `exit()` and its own sub-state object.

### 4.5 `SnapshotManager`

Encapsulate the undo/redo system.

Current location: `_saveSnapshot()` lines 330–347, `undoAction()` lines 349–362, `rollbackStreet()` lines 364–377.

Proposed:
```
SnapshotManager.save(state, type) → void
SnapshotManager.undoAction(state) → restoredState | null
SnapshotManager.rollbackStreet(state) → restoredState | null
```

---

## 5. SessionManager Coupling

### Current Violations

1. **Line 80**: `this.gm._gamePlayers()` inside `SessionManager.startGame()` — SessionManager invokes a private GameManager method.
2. **Line 109**: `const state = this.gm.state` — `endHand()` reads `gm.state.showdown_result` and `gm.state.winner` directly, bypassing `getPublicState()`.
3. **Line 277**: `get state() { return this.gm.state; }` — exposes raw internal state from SessionManager. Used pervasively in `server/index.js` (~40+ direct reads of `gm.state.*`).
4. **Test suite** calls `sm.gm._gamePlayers()` directly — private method access in tests.

### Proposed Cleaner Interface

Add two methods to `GameManager`:

```js
// Returns minimal summary needed by SessionManager.endHand()
getHandSummary() → {
  winner: string | null,
  showdown_result: ShowdownResult | null,
  dealtInPlayerIds: string[]
}

// Returns player objects for non-private consumption
getActivePlayers() → PlayerSnapshot[]
```

Remove the `get state()` passthrough from `SessionManager`. Update `server/index.js` to use `getPublicState()` for all reads. This is the highest-effort change but enables future encapsulation.

---

## 6. Test Coverage Quality

### What Is Well-Tested

- Core `placeBet` paths: fold, check, call, raise, all-in (~50 test cases)
- Undo/rollback correctness (suites 5–6)
- Side pot calculation edge cases: 2-player all-in, 3-player cascade, remainder chips
- SessionManager stat accumulation: VPIP, PFR, WTSD, WSD, netChips (14 cases)
- Stress test: 1000 random hands with chip conservation assertion
- Replay: load, step, filter reverted actions
- Bug regression: ISS-13, ISS-15, ISS-16
- Disconnect + reconnect timer

### Coverage Gaps

1. **`_advanceStreet()` recursive all-in runout path** — when all remaining players are all-in mid-street, `_advanceStreet()` calls itself recursively. No test specifically asserts the board deals correctly in this recursive path.
2. **`branchFromReplay()` + `startGame()` + full hand** — shadow player injection tested indirectly; no test asserts chip conservation after a complete branched-hand game.
3. **`getPublicState()` hole card mutation bug** — lines 106–110 mutate `p.hole_cards` in the array derived from `state.players.map(...)`. Shallow copy lets mutation bleed through. No test catches this.
4. **`_sortWinnersBySBProximity()` with gap seats** — `Math.max(...allSeats) + 1` gives wrong result if seats are non-contiguous (e.g., 0, 2, 5). No test.
5. **`setBlindLevels()` during hand** — guard at line 1074 rejects but no test confirms.
6. **`adjustStack()` below committed amount** — tested for preflop only; no per-street coverage.
7. **Playlist `seekPlaylist()` boundary conditions** — clamping logic untested.
8. **`_buildReplayStateAtCursor(-1)` reset** — state after jumping to -1 not explicitly asserted.

### What Is Hard to Test Due to Design

`_resolveShowdown()` reads `this.state.board` and `this.state._full_board`, evaluates hands, and distributes chips all in one method. Tests must construct a complete game state. Extracting `ShowdownResolver.resolve()` as a pure function would allow testing pot math independently.

`_advanceStreet()` mutates phase, deals cards, resets per-street state, and may recurse to showdown — all in one call. The recursive auto-runout path is hard to isolate.

---

## 7. Error Return Pattern

### Current Pattern

`return { error: '...' }` for validation failures; `return { success: true }` for success.

### Evaluation

**Pros:** Explicit at call sites; no try/catch needed for expected failures; easy to pattern-match in tests.

**Cons:**
- Callers can silently ignore errors. Several socket handlers after line 700 don't check result before calling `broadcastState`.
- No distinction between "invalid input" (recoverable) and "illegal state" (structural bug). Both return `{ error }`.
- Inconsistent success shape: some return `{ success: true, paused: ... }` (line 1063), others just `{ success: true }`.

### Proposed Improvement

- Keep `{ error }` for recoverable user-facing validation ("Not your turn", "Minimum raise to X").
- Add `throw new Error(...)` for structural invariant violations that should never occur in correct usage (e.g., negative pot, player not found during a validated turn). These indicate bugs and should surface in logs.
- Standardise success return: `{ ok: true }` across all methods.

---

## 8. Specific Refactors

### Refactor 1 — Extract `isBettingRoundOver` as pure function

Move logic into `bettingRound.js` as `isBettingRoundOver(activePlayers, currentBet)`.
`GameManager._isBettingRoundOver()` becomes a thin delegation wrapper.

### Refactor 2 — Fix `getPublicState()` hole card mutation (bug)

Lines 106–110: `p.hole_cards = [...cards]` assigns through a shallow player copy back to the original state.

Fix: replace `p.hole_cards` assignment with a new player object:
```
players.forEach((p, i) => {
  const cards = s.replay_mode.original_hole_cards[p.stableId];
  if (cards && cards.length > 0) players[i] = { ...p, hole_cards: [...cards] };
});
```

### Refactor 3 — `_postBlind` signature change to return deltas

Move to `BlindManager.computeBlindPost(player, amount)` → `{ paid, isAllIn }`.
Caller applies the delta. Makes blind posting unit-testable without a full `GameManager`.

### Refactor 4 — Remove `is_replay_branch`, use `replay_mode.branched`

Remove `state.is_replay_branch` top-level flag. All consumers use `state.replay_mode.branched` instead. Cleared in `exitReplay()` alongside the rest of `replay_mode`.

Impacted read site in `server/index.js` (~line 584):
```js
// Before:
if (!gm.state.is_replay_branch) { ... }
// After:
if (!gm.state.replay_mode.branched) { ... }
```

### Refactor 5 — Standardise `addPlayer` return value

Before: `{ error: string } | { success: true, player: PlayerObject }`
After: `{ error: string } | { ok: true, player: PlayerSnapshot }`
`PlayerSnapshot` excludes internal fields (`acted_this_street`, `total_contributed`, `in_hand`).

### Refactor 6 — Extract board-dealing into `BoardDealer`

`_advanceStreet()` contains three board-dealing branches (lines 958–992): `_full_board` slice, RNG deck pop, manual coach injection.

Introduce `dealBoard(phase, state) → string[]` pure function. `_advanceStreet` calls it and assigns the result.

### Refactor 7 — Add `GameManager.getHandSummary()` to decouple `SessionManager`

```js
getHandSummary() {
  return {
    winner: this.state.winner,
    showdown_result: this.state.showdown_result,
    dealtInPlayerIds: this._gamePlayers()
      .filter(p => Array.isArray(p.hole_cards) && p.hole_cards.length === 2)
      .map(p => p.id)
  };
}
```
`SessionManager.endHand()` calls `this.gm.getHandSummary()` instead of reading raw state.

---

## 9. Backwards Compatibility Strategy

### Façade-Preserving Extraction

1. **Never rename or remove a public `GameManager` method.** Extract implementation into sub-modules; keep every existing method as a thin delegation wrapper.
2. **Never change return shapes externally.** All `{ error }` / `{ success }` shapes stay identical from the caller's perspective.
3. **Keep `SessionManager`'s proxy list intact.** When adding methods to `GameManager`, add the corresponding proxy to `SessionManager` simultaneously.
4. **Test-driven extraction.** Write at least three unit tests for each pure function before extracting it.
5. **One sub-module per PR.** Extract in dependency order: `BlindManager` first → `BettingRound` → `ShowdownResolver` → `SnapshotManager` → `ReplayEngine`.

### Protecting `server/index.js`

The 40+ direct `gm.state.*` reads are the highest-risk coupling point. Migrate last, after `getPublicState()` is proven to cover every externally-read field:

- `gm.state.players` (many sites) → add `getSeatedPlayers()` method
- `gm.state.is_replay_branch` → after Refactor 4, replace with `gm.state.replay_mode.branched`
- `gm.state.dealer_seat` → already in `getPublicState()`; migrate read sites to use projected state
- `gm.sessionId` → `SessionManager` exposes this; keep as-is

---

## 10. Risk Analysis

### High Risk

| Risk | Tests Covering It | Mitigation |
|---|---|---|
| `_resolveShowdown` stack mutation during extraction | GameManager.sidepots.test.js, stress.test.js | Extract with pure return value; apply deltas in caller; re-run stress test |
| `_advanceStreet` recursive all-in runout path | No direct test (gap #1) | Write test first before touching `_advanceStreet` |
| `getPublicState()` hole card mutation in replay | No test (gap #3) | Write regression test before fixing; fix atomically |
| Undo/rollback snapshot bloat post-extraction | GameManager.test.js suites 5–6 | `_saveSnapshot` must include delegated sub-module state |

### Medium Risk

| Risk | Tests Covering It | Mitigation |
|---|---|---|
| `SessionManager.endHand()` missing winner path after decoupling | SessionManager.test.js suites 5–6 | `getHandSummary()` must cover both fold-to-one and showdown paths |
| `branchFromReplay()` shadow player injection breaks after `_gamePlayers()` extraction | GameManager.replay.test.js | Add post-branch full-hand test (gap #2) first |
| `_sortWinnersBySBProximity` gap-seat bug | No test (gap #4) | Add test; fix `numSeats = Math.max(...allSeats) + 1` calculation |

### Low Risk (modules already well-designed)

- `positions.js` — pure utility, no changes needed
- `Deck.js` — pure functions, no changes needed
- `SidePotCalculator.js` — pure, well-documented, no changes needed

### Tests Needed Before Starting

1. `_advanceStreet` recursive all-in runout: 3 players, two all-in preflop → assert board auto-deals to showdown
2. `getPublicState()` replay hole card assignment: assert original `state.players[i].hole_cards` is NOT mutated
3. `branchFromReplay()` + full hand: assert chip conservation after complete branched game
4. `_sortWinnersBySBProximity` gap seats: players at seats 0, 2, 5 — assert correct tiebreak
5. `adjustStack()` during flop/turn/river: assert error for each active street

---

## Critical Files for Implementation

| File | Role |
|---|---|
| `server/game/GameManager.js` | Core logic to decompose; all refactors originate here |
| `server/game/SessionManager.js` | Coupling to remove via `getHandSummary()` and `getActivePlayers()` |
| `server/game/__tests__/GameManager.test.js` | Primary regression net; pattern for new pure-function unit tests |
| `server/game/__tests__/stress.test.js` | Chip conservation guard; must stay green after every extraction step |
| `server/index.js` | 38 socket handlers + 40+ direct `gm.state.*` reads defining the backwards-compat surface |
