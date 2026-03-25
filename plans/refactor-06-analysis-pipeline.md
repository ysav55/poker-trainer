# Refactor Plan 06 — Hand Analysis Pipeline & Evaluation Modules

**Date:** 2026-03-24
**Scope:** `server/game/tagAnalyzers/`, `server/game/HandEvaluator.js`,
`server/game/HandGenerator.js`, `server/game/RangeParser.js`,
`server/db/HandLoggerSupabase.js` (`buildAnalyzerContext` + `analyzeAndTagHand`)
**Status:** Planning — no code changes yet

---

## 1. Current State Audit

### Pipeline end-to-end

When a hand ends in `server/index.js`, the Socket.io handler fires
`HandLogger.endHand(...)` and chains `.then(() => HandLogger.analyzeAndTagHand(handId))`.
Everything is fire-and-forget with a top-level `.catch`. The analysis therefore
runs fully asynchronously after the hand result has already been broadcast to
players, which is correct — clients never wait on it.

`analyzeAndTagHand(handId)` in `HandLoggerSupabase.js`:

1. Calls `buildAnalyzerContext(handId)` — one shared build step that hits
   Supabase for three queries (hands, hand_actions, hand_players).
2. Iterates `ANALYZER_REGISTRY` in a `for...of` loop. Each analyzer is invoked
   as `analyzer.analyze(ctx)`. Errors are caught per-analyzer and logged to
   `console.error`; the loop continues regardless.
3. Deduplicates hand-level tags (`player_id IS NULL`) with a `seen` Set keyed on
   `tag_type::tag`.
4. Atomically deletes all existing `auto`, `mistake`, and `sizing` tag rows for
   the hand, then bulk-inserts the new `tagRows` array. Coach tags are
   untouched. This delete-then-insert pattern is re-runnable (idempotent re-analysis).

### Context object fields (returned by `buildAnalyzerContext`)

| Field              | Type                  | Source                                           |
|--------------------|-----------------------|--------------------------------------------------|
| `hand`             | DB row                | `hands` table, single row                       |
| `allActions`       | DB row[]              | All `hand_actions` rows incl. reverted           |
| `actions`          | DB row[]              | Non-reverted rows, enriched with `sizingRatio`   |
| `byStreet`         | `{[street]: row[]}`   | Grouped from `actions`                           |
| `seated`           | DB row[]              | `hand_players` where `seat >= 0`, sorted by seat |
| `positions`        | `{[playerId]: label}` | `buildPositionMap(seated, hand.dealer_seat)`     |
| `bbPlayerId`       | UUID or null          | Computed inline from `seated` + `dealer_seat`    |
| `potByStreet`      | `{[street]: number}`  | First `pot_at_action` or running sum fallback    |
| `evaluateAt`       | `fn(playerId, street)`| Closure over `holeCardsByPlayer` + `board`       |
| `holeCardsByPlayer`| `{[playerId]: card[]}`| From `hand_players.hole_cards`                   |

Three Supabase round-trips occur before any analyzer runs. There is currently
no caching and no batching; each call awaits in sequence.

### ANALYZER_REGISTRY pattern

`server/game/tagAnalyzers/index.js` exports a plain array of analyzer objects.
Each object satisfies an informal interface:

```js
{
  name: string,
  analyze(ctx: AnalyzerContext): TagResult[]
}
```

`TagResult` is documented in `index.js`:

```js
{ tag: string, tag_type: 'auto'|'mistake'|'sizing', player_id?: UUID, action_id?: number }
```

Adding a new analyzer requires: (a) creating the module file, (b) requiring it
in `index.js`, and (c) pushing it onto the array. No other file changes are
needed.

---

## 2. Pipeline Architecture — Parallelism and Dependencies

### Can analyzers run in parallel?

All 9 analyzers are **read-only consumers** of the shared `ctx` object. None
mutates `ctx`, none returns data that another analyzer consumes. This means
there is **no inter-analyzer data dependency** and the registry could in
principle be `Promise.all`-ed.

However, there are **logical cross-concerns** (not technical dependencies)
worth noting:

- `PositionalAnalyzer` duplicates the C-bet detection logic from
  `PostflopAnalyzer` — both find `lastPFRaiser` independently. If they
  disagree on a tag (they cannot in the current code because they read the
  same `ctx`) the duplication is still a correctness risk if one is modified
  without the other.
- `MistakeAnalyzer.FOLD_TO_PROBE` reads `sizingRatio` which is pre-computed in
  `buildAnalyzerContext`, not by `SizingAnalyzer`. So there is no runtime
  dependency between `MistakeAnalyzer` and `SizingAnalyzer`.

### Dependency graph

```
buildAnalyzerContext (async, 3 DB queries)
        │
        ▼
  ctx (frozen view)
  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
  │ Street   │ Preflop  │ Postflop │ PotType  │ Board    │ Mistakes │ Sizing   │Positional│HandStrth │
  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
        │
        ▼
  rawResults (flat concat)
        │
        ▼
  dedup + format → delete + insert
```

All 9 boxes are independent of each other. `Promise.allSettled` is safe.

### Parallelism recommendation

Replace the `for...of` loop in `analyzeAndTagHand` with a `Promise.allSettled`
call over the registry, where each analyzer is wrapped in a
`Promise.resolve().then(() => analyzer.analyze(ctx))`. Use `.allSettled` (not
`.all`) so that a thrown exception in one analyzer does not cancel the rest.
This is a low-risk change with modest throughput benefit on the server (Node.js
event loop, so CPU-bound gain is minimal, but it eliminates ordering dependence
and future-proofs async analyzers).

---

## 3. Context Object Design

### Is `buildAnalyzerContext` the right abstraction?

Yes, the single-fetch-once pattern is correct in principle. The problem is that
the three Supabase queries are run sequentially even though they are independent
of each other. They can be parallelized with `Promise.all`.

```js
const [hand, allActions, handPlayers] = await Promise.all([
  q(supabase.from('hands').select('*').eq('hand_id', handId).maybeSingle()),
  q(supabase.from('hand_actions').select('*').eq('hand_id', handId).order('id', { ascending: true })),
  q(supabase.from('hand_players').select('*').eq('hand_id', handId)),
]);
```

This is the single highest-leverage change in the entire pipeline — three
sequential DB round-trips become one concurrent batch.

### What is expensive?

- `evaluateAt` computes `C(n,5)` combinations on each call (up to
  `C(7,5) = 21` evaluations). `HandStrengthAnalyzer` can call it up to
  `(N players) * (3 streets)` times per hand. With 9 players this is 27 calls
  per hand. Each call is pure-CPU, no I/O. The cost is acceptable but an
  optional memoization layer (keyed on `playerId + street`) would halve calls
  for players who act on multiple streets.
- `buildPositionMap` is called once — no concern.
- `potByStreet` fallback uses a running sum which involves iterating all
  actions. This is O(n) and acceptable.

### What could be pre-computed during the hand?

Currently `position` is written to `hand_actions` at `recordAction` time, which
is ideal. The following fields are computed post-hoc and could instead be
materialized at hand-end time if performance becomes a concern:

- `sizingRatio` — written to the action row at DB write time would save the
  in-memory enrichment loop in `buildAnalyzerContext`.
- `potByStreet` — a `pot_entering_street` column on the `hands` table would
  make this O(1) per street.

Neither is urgent at the current hand volume (46 hands total).

### Dead code in `HandLoggerSupabase.js`

Two functions defined in the file are never called from within the file itself:
- `normalizeAction` — duplicates `util.js`; neither is imported into the other.
- `_findBBPlayerId` — duplicates the inline `bbPlayerId` closure in
  `buildAnalyzerContext`. Both implement identical logic. One should be deleted.

---

## 4. Analyzer Interface Contract

### Current state

The interface is documented only in a JSDoc comment in `index.js`. There is no
runtime enforcement, no schema validation, and no TypeScript. The `analyze`
method is expected to be synchronous and return `TagResult[]`.

### Proposed formal JSDoc schema (to add to `index.js`)

```js
/**
 * @typedef {Object} TagResult
 * @property {string} tag             - Unique tag identifier, SCREAMING_SNAKE_CASE
 * @property {'auto'|'mistake'|'sizing'} tag_type
 * @property {string|undefined} player_id  - UUID. Omit for hand-level tags.
 * @property {number|undefined} action_id  - hand_actions.id. Omit unless tag is per-action.
 */

/**
 * @typedef {Object} Analyzer
 * @property {string} name
 * @property {function(AnalyzerContext): TagResult[]} analyze
 */
```

### Error and null handling expectations

- `analyze` MUST NOT throw. All exceptions should be caught internally and
  logged, with the method returning `[]` on error. Currently the pipeline
  catches exceptions at the call site, which is correct as a safety net, but
  individual analyzers should also guard their own hot paths (especially
  `evaluateAt` calls which can return null).
- `analyze` MUST return an array, never `null` or `undefined`.
- Tags with `player_id` MUST include a value that is a UUID string. Tags
  without `player_id` should omit the field (not set it to `null` — the
  current code passes `player_id: r.player_id ?? null` at the insert layer,
  which is fine, but analyzers should be consistent).

### Missing validation at ingestion

`analyzeAndTagHand` does not validate `TagResult` shape before inserting.
A malformed result (e.g. missing `tag` field) would cause a silent Supabase
insert error caught by the outer `.catch` in the Socket.io handler. Adding a
lightweight shape check before the insert step would surface bugs faster.

---

## 5. `util.js` Patterns — Sufficiency and Duplication

### What `util.js` provides

`normalizeAction(action)` maps past-tense DB strings to present-tense canonical
forms. `norm(actionRow)` is a shorthand that applies it to `actionRow.action`.

### Duplication issues

1. `normalizeAction` is duplicated verbatim in `HandLoggerSupabase.js`. The
   version in `HandLoggerSupabase.js` is never called — the analyzers only
   import from `util.js`. The dead copy should be removed.

2. The `lastPFRaiser` pattern (`[...pre].reverse().find(a => norm(a) === 'raise')`)
   appears identically in three separate files:
   - `postflop.js` (C_BET)
   - `postflop.js` (DONK_BET)
   - `positional.js` (C_BET_IP/OOP)
   - `positional.js` (DONK_BET_BB)

   Extract to `util.js` as `findLastPFRaiser(byStreet)`.

3. The `lastBetIdx` scan pattern (walk river actions backward to find last
   bet/raise) appears identically in `postflop.js` (BLUFF_CATCH) and
   `handStrength.js` (HERO_CALL). Extract to `util.js` as
   `findLastAggressorIndex(streetActions)`.

4. The `raiseCount` loop for finding the 3-bet raiser appears in both
   `positional.js` (3BET_BTN/3BET_SB) and `mistakes.js` (COLD_CALL_3BET).
   Extract to `util.js` as `findNthRaiser(pre, n)`.

### What `util.js` is missing

- `isAggressive(action)` — `['bet', 'raise', 'all-in'].includes(norm(a))` is
  written inline in multiple files. A named helper reduces typos.

---

## 6. HandEvaluator Audit

### Design

`HandEvaluator.js` is a well-designed pure module. It exports `evaluate`,
`evaluateFive`, `compareHands`, and `HAND_RANKS`. No side effects, no imports
from `GameManager`. The design is correct.

### Algorithm: `evaluate`

Generates `C(n, 5)` combinations from all available cards and picks the best
via `compareHands`. For the standard 7-card case (2 hole + 5 board) this is
`C(7,5) = 21` evaluations. For 6-card partial boards (turn) it is
`C(6,5) = 6`. This is fast enough for server-side use.

### Correctness concerns

- **Wheel straight (`isWheelStraight`):** Hardcoded to `[12, 3, 2, 1, 0]` which
  is A-5-4-3-2. This is correct.
- **Full House tiebreaking:** Uses `pairCards` as the kickers array (ISS-26). Correct.
- **`evaluateShort`:** Only detects made hands (pair/trips/quads); skips flush
  and straight. Documented in ISS-27. Acceptable for partial hands.
- **`combinations` helper:** Recursive. For `C(7,5)` this is fine.

### Test coverage

`HandEvaluator.test.js` is comprehensive — covers all 10 hand ranks, wheel
straight, tiebreaking, `compareHands`, and structural invariants. No gaps identified.

### Improvement opportunity

`handStrength.js` defines its own tier constants (`MONSTER = 3`, `STRONG = 2`,
`MARGINAL = 1`) instead of importing from `HAND_RANKS`. If `HAND_RANKS.THREE_OF_A_KIND`
were ever renumbered, `handStrength.js` would silently break. Fix: import
`HAND_RANKS` from `HandEvaluator.js` and use named constants.

---

## 7. HandGenerator Audit

### Design

`HandGenerator.js` exports `generateHandClean` (as `generateHand`), plus
`flopSatisfiesTexture` and `validateBoardTexture`. The file contains an
abandoned first-draft implementation (lines 181–350) with placeholder comments.
Only `generateHandClean` is the real implementation. The dead code should be
deleted to eliminate confusion.

### Fill-the-Gaps algorithm

1. Validates `board_texture` constraints.
2. Resolves range strings to specific cards using `RangeParser.pickFromRange`.
3. Collects all pinned cards; checks validity and uniqueness.
4. Builds a shuffled deck excluding pinned cards.
5. Assigns null hole-card slots from the deck.
6. Assigns null board slots, with optional retry loop (up to 100 attempts) for
   texture constraints.
7. Returns `{ playerCards, board, deck, hand: { playerCards, board, deck } }`.

The dual return shape (flat + nested `hand`) is backward compatibility for older
callers and should be documented explicitly.

### Edge cases and gaps

- **Texture constraint failure after 100 attempts:** Returns `{ error: "..." }`.
  There is no distinction between "impossible constraint" and "unlucky random
  seed".
- **`hole_cards_combos` field:** Referenced in `normConfig` normalization but
  not documented in the JSDoc header. Appears to be a planned feature that was
  partially integrated. Needs documentation and a test (or removal).
- **`stableId` vs `id` key lookup:** Uses `player.stableId || player.id` when
  assigning hole cards. Should be documented clearly.
- **`board_texture` on turn/river:** Only applied to the first 3 board cards.
  Correct behavior but unstated in JSDoc.

---

## 8. RangeParser Audit

### Supported formats

`AA`, `AA-TT`, `AKs`, `AKo`, `AK`, `AQs+`, `AJo+`, `JTs-87s`, `66+`

### What fails silently

- **Unrecognized tokens:** `parseSingleToken` returns `[]` and `parseRange`
  skips them. `validateRange` catches this but only if the caller uses it.
- **Wrong-order suited-connector ranges:** `87s-JTs` returns `[]` silently.
  The outer code re-sorts tokens, so this is safe, but the logic is fragile.
- **Offsuit connector ranges:** `AKo-QJo` is not supported. Returns `[]` silently.
- **Case sensitivity:** `parseRange` calls `.toUpperCase()` on the full string;
  `parseSingleToken` also calls it independently. Redundant but not harmful.

### Tests

`RangeParser.test.js` covers all documented syntax forms. The silent failure
modes (unrecognized tokens, wrong-order suited-connector ranges) are not tested.

---

## 9. Extensibility — Adding a 10th Analyzer

### Current difficulty: low

1. Create `server/game/tagAnalyzers/myNew.js` with `{ name, analyze(ctx) }`.
2. `require` it in `server/game/tagAnalyzers/index.js`.
3. Push onto `ANALYZER_REGISTRY`.

No schema migration is needed for new tags.

### Contribution guide (`ANALYZER_AUTHORING.md` to create)

1. **File naming:** `server/game/tagAnalyzers/<descriptiveGroup>.js`, lowercase.
2. **Module shape:** Export a single object `{ name: 'XxxAnalyzer', analyze(ctx) { ... } }`.
3. **Return type:** Always return `TagResult[]`. Return `[]` on no match. Never return `null`.
4. **Error handling:** Wrap risky lookups (especially `evaluateAt` calls) in null-guards. Do not throw.
5. **Tag naming:** `SCREAMING_SNAKE_CASE`.
6. **tag_type selection:**
   - `'auto'` — factual observation (C_BET, 3BET_POT, SAW_FLOP).
   - `'mistake'` — potentially poor play; always include `player_id`.
   - `'sizing'` — per-action; always include both `player_id` and `action_id`.
7. **player_id rules:** Include for player-specific tags. Omit for hand-level tags.
8. **action_id rules:** Include only for tags that reference a specific action.
9. **Testing:** Every new analyzer must have isolated unit tests using synthetic `ctx` objects.
10. **Registration:** Push onto `ANALYZER_REGISTRY` at the end of `index.js`.

---

## 10. Error Isolation

### Current state

`analyzeAndTagHand` wraps each `analyzer.analyze(ctx)` call in a `try/catch`
and logs to `console.error`. The loop continues on failure. This is correct.

### Gaps

- **`buildAnalyzerContext` failure:** If any of the three Supabase queries
  fails, `buildAnalyzerContext` throws. `analyzeAndTagHand` does not catch this —
  it relies on the caller's `.catch` in `index.js`. Adding a top-level try/catch
  inside `analyzeAndTagHand` would make it self-contained.
- **No partial-analysis signal:** There is no `analysis_error` flag or log entry
  when analysis was skipped or partial. A failed analysis is invisible to the UI.
- **`Promise.allSettled` upgrade:** Moving to parallel execution automatically
  handles analyzer failures through `.allSettled`, giving each analyzer an
  independent fault boundary.

### Recommended additions

- Add a try/catch around `buildAnalyzerContext` inside `analyzeAndTagHand`.
- In `Promise.allSettled` mode, log the names of any rejected analyzers before
  continuing to the insert step.
- Add an `analysis_error` boolean to `hands` or a `hand_analysis_log` table for
  visibility.

---

## 11. Test Quality

### What exists

| Module                | Test file                          | Coverage level |
|-----------------------|------------------------------------|----------------|
| `HandEvaluator.js`    | `HandEvaluator.test.js`            | Comprehensive  |
| `HandGenerator.js`    | `HandGenerator.test.js`            | Good           |
| `HandGenerator.js`    | `HandGenerator.range.test.js`      | Good           |
| `RangeParser.js`      | `RangeParser.test.js`              | Good           |
| `HandLoggerSupabase`  | `Phase6.test.js` (position only)   | Narrow         |
| `tagAnalyzers/`       | **None**                           | Zero           |

### Critical gap: no analyzer unit tests

Not one of the 9 analyzer modules has a dedicated test file. All analyzer
testing is currently indirect — the socket integration test mocks
`analyzeAndTagHand` entirely, so no analyzer logic is exercised by the suite.

### What analyzer tests should look like

```js
const ctx = {
  hand:      { dealer_seat: 0, board: ['Ah','Kd','Qc','Jh','Ts'] },
  byStreet:  { preflop: [
    { player_id: 'p1', action: 'raise', amount: 40 },
    { player_id: 'p2', action: 'raise', amount: 120 },
    { player_id: 'p3', action: 'call',  amount: 120 },
  ]},
  seated:    [{ player_id: 'p1', seat: 0 }],
  bbPlayerId: 'p3',
};
const tags = PreflopAnalyzer.analyze(ctx);
expect(tags.some(t => t.tag === '3BET_POT')).toBe(true);
```

Priority order for new test files:
1. `MistakeAnalyzer` — most behavioral logic, most likely to regress.
2. `HandStrengthAnalyzer` — depends on `evaluateAt`; needs exercising.
3. `PostflopAnalyzer` + `PositionalAnalyzer` — C-bet logic overlap.
4. `PreflopAnalyzer` — moderate complexity (SQUEEZE, BLIND_DEFENSE).
5. `SizingAnalyzer` — `classifySizing` boundary values (0.24, 0.25, 0.49, 0.50, 0.79, 0.80, 1.10, 2.00, 2.01).
6. `StreetAnalyzer`, `BoardAnalyzer`, `PotTypeAnalyzer` — simple but important.

---

## 12. Implementation Sequence

1. **Clean up dead code** — remove the duplicate `normalizeAction` and
   `_findBBPlayerId` from `HandLoggerSupabase.js`; remove the abandoned
   first-draft function from `HandGenerator.js` (lines 181-363).

2. **Parallel DB queries in `buildAnalyzerContext`** — replace three sequential
   `await` calls with a single `Promise.all`. Low risk, no interface change.

3. **Extract shared helpers to `util.js`** — `findLastPFRaiser`,
   `findLastAggressorIndex`, `findNthRaiser`, `isAggressive`. Update affected
   analyzer files. Add tests for the helpers.

4. **Fix `handStrength.js` tier constants** — import `HAND_RANKS` from
   `HandEvaluator.js` and replace magic numbers 3/2/1 with named constants.

5. **Add JSDoc typedef block to `index.js`** — codify the `TagResult` and
   `Analyzer` types. Add `TagResult` shape validation before the insert step.

6. **Move to `Promise.allSettled` in `analyzeAndTagHand`** — replace the
   `for...of` loop. Update error logging to include rejected analyzer names.
   Add try/catch around `buildAnalyzerContext`.

7. **Add `evaluateAt` memoization in `buildAnalyzerContext`** — wrap the
   closure in a `Map` keyed on `${playerId}:${street}`. Non-breaking.

8. **Write analyzer unit tests** — one test file per analyzer, in priority
   order from section 11. Target: 50+ new test cases.

9. **Document `hole_cards_combos`** in `HandGenerator.js` header and add a
   test for it (or remove it if unused).

10. **Write `ANALYZER_AUTHORING.md`** — contribution guide as specified in
    section 9.

---

## Critical Files for Implementation

| File | Role |
|---|---|
| `server/db/HandLoggerSupabase.js` | Core pipeline orchestration: `buildAnalyzerContext` (parallel DB queries, memoized `evaluateAt`, dead-code removal) and `analyzeAndTagHand` (`Promise.allSettled`, shape validation, error isolation) |
| `server/game/tagAnalyzers/index.js` | Interface contract: add JSDoc typedef block, update registry if new analyzer added |
| `server/game/tagAnalyzers/util.js` | Shared helpers to extract: `findLastPFRaiser`, `findLastAggressorIndex`, `findNthRaiser`, `isAggressive` |
| `server/game/tagAnalyzers/handStrength.js` | Fix magic-number tier constants to use imported `HAND_RANKS`; highest correctness risk if `HandEvaluator` is modified |
| `server/game/HandGenerator.js` | Remove abandoned first-draft function (lines 181-363), document `hole_cards_combos`, clarify `stableId` vs `id` key lookup |
