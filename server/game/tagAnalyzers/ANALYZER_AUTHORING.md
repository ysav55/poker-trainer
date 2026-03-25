# Tag Analyzer Authoring Guide

This guide explains how to write a new tag analyzer for the poker trainer's
hand analysis pipeline. Read it before adding a new tag to the codebase.

---

## What Is an Analyzer?

An analyzer is a plain JavaScript object that inspects a completed hand and
returns zero or more tags describing what happened. Tags are stored in
`hand_tags` and surfaced to coaches and players via the UI.

Every analyzer must satisfy the following interface:

```js
const MyAnalyzer = {
  name: 'MyAnalyzer',           // string — unique, used in error logs
  analyze(ctx) {                // ctx shape described below
    return [];                  // TagResult[]
  },
};
```

**Rules that must never be broken:**

- `analyze` must not throw. Wrap any fragile logic in try/catch and return `[]`
  on failure.
- `analyze` must return an empty array `[]` when no tags apply, never `null`
  or `undefined`.
- `analyze` must be a pure function. It must not make network calls, DB calls,
  or mutate the ctx object.
- All tags must use `SCREAMING_SNAKE_CASE` identifiers.

---

## The `ctx` Object

`buildAnalyzerContext` (in `server/game/AnalyzerService.js`) assembles this
object once per hand and passes it to every analyzer.

```
ctx = {
  hand:            Object        — the full hand row from the `hands` table
  allActions:      Object[]      — every hand_actions row (including reverted)
  actions:         Object[]      — non-reverted actions, enriched with sizingRatio
  byStreet:        Object        — actions grouped by street name
  seated:          Object[]      — hand_players rows, sorted by seat number
  positions:       Object        — { [player_id]: 'BTN' | 'SB' | 'BB' | ... }
  bbPlayerId:      string|null   — UUID of the big blind player
  potByStreet:     Object        — pot size entering each street
  evaluateAt:      Function      — see "Hand Strength" below
  holeCardsByPlayer: Object      — { [player_id]: string[] } raw hole card arrays
}
```

### `hand` row (selected fields)

| Field | Type | Notes |
|---|---|---|
| `hand_id` | `string` (UUID) | Primary key |
| `board` | `string[]` | 0–5 cards |
| `phase_ended` | `string` | e.g. `'showdown'`, `'fold'` |
| `dealer_seat` | `number` | Seat index of the dealer button |
| `big_blind` | `number` | BB amount in chips |

### `actions` — enriched action rows

Each entry in `actions` is a row from `hand_actions` with one added field:

| Field | Type | Notes |
|---|---|---|
| `id` | `number` | `hand_actions.id` — use as `action_id` |
| `player_id` | `string` (UUID) | The acting player |
| `street` | `string` | `'preflop'` \| `'flop'` \| `'turn'` \| `'river'` |
| `action` | `string` | DB form: `'raised'`, `'called'`, `'folded'`, `'checked'` |
| `amount` | `number` | Chips bet/raised/called |
| `pot_at_action` | `number` | Pot size before this action |
| `position` | `string` | `'BTN'` \| `'SB'` \| `'BB'` \| `'CO'` \| etc. |
| `is_reverted` | `boolean` | Always `false` in `actions`; may be `true` in `allActions` |
| `sizingRatio` | `number\|null` | `amount / pot_at_action`; null when pot is 0 |

### `byStreet`

```js
ctx.byStreet['preflop']  // Object[] — preflop actions
ctx.byStreet['flop']     // Object[] — flop actions (may be undefined)
ctx.byStreet['turn']     // Object[] — turn actions (may be undefined)
ctx.byStreet['river']    // Object[] — river actions (may be undefined)
```

Always access via `byStreet[street] || []` to handle missing streets safely.

### `potByStreet`

```js
ctx.potByStreet['preflop']  // number — pot entering preflop (usually 0)
ctx.potByStreet['flop']     // number — pot entering the flop
ctx.potByStreet['turn']     // number
ctx.potByStreet['river']    // number
```

### `evaluateAt(playerId, street)` — hand strength

Returns a `HandResult` object or `null`. Evaluates the player's hole cards
against the board up to and including the given street. Results are memoized.

```js
const result = ctx.evaluateAt(playerId, 'flop');
if (!result) return [];        // hole cards missing or board too short
result.rank       // 0 (HIGH_CARD) … 9 (ROYAL_FLUSH) — use HAND_RANKS constants
result.rankName   // string e.g. 'ONE_PAIR', 'TWO_PAIR', 'FLUSH'
result.bestFive   // string[] — the 5-card best hand
```

Import rank constants from `HandEvaluator` for readability:

```js
const { HAND_RANKS } = require('../HandEvaluator');
// HAND_RANKS.HIGH_CARD === 0
// HAND_RANKS.ONE_PAIR  === 1
// HAND_RANKS.TWO_PAIR  === 2
// HAND_RANKS.THREE_OF_A_KIND === 3  ← "monster" threshold used in practice
// ...up to HAND_RANKS.ROYAL_FLUSH === 9
```

---

## The `TagResult` Shape

```js
{
  tag:        string,              // SCREAMING_SNAKE_CASE, required
  tag_type:   'auto' | 'mistake' | 'sizing',  // required
  player_id?: string,             // UUID — include for player-level tags
  action_id?: number,             // hand_actions.id — include for action-level tags
}
```

### Which fields to set

| Level | player_id | action_id | Example tag |
|---|---|---|---|
| Hand-level | omit | omit | `WALK`, `SAW_FLOP`, `MONOTONE_BOARD` |
| Player-level | include | omit | `OPEN_LIMP`, `SLOWPLAY`, `COLD_CALL_3BET` |
| Action-level | include | include | `MIN_RAISE`, `HERO_CALL`, `HALF_POT_BET` |

When `player_id` is `undefined` the pipeline sets it to `null` before insert.
When `action_id` is `undefined` the pipeline sets it to `null` before insert.

### `tag_type` values

| Value | Meaning |
|---|---|
| `'auto'` | Descriptive tag — no judgment implied. Fact about the hand. |
| `'mistake'` | Coaching flag — potentially incorrect play. Coach can override. |
| `'sizing'` | Bet sizing classification. Always includes `action_id`. |

---

## Util Helpers (`./util.js`)

Import from `'./util'` — do not copy these into your analyzer.

```js
const {
  normalizeAction,      // (actionString) → canonical present-tense string
  norm,                 // (actionRow)    → canonical present-tense string
  findLastPFRaiser,     // (preflopActions) → last action row with norm==='raise'
  findLastAggressorIndex, // (streetActions) → index of last bet/raise, or -1
  findNthRaiser,        // (preflopActions, n) → nth raise action row or null
  isAggressive,         // (actionRow) → true if bet / raise / all-in
} = require('./util');
```

### `normalizeAction` / `norm`

DB action strings use past tense (`'raised'`, `'folded'`, `'called'`,
`'checked'`). Always normalize before comparing:

```js
// Wrong — fragile against DB form variation
if (action.action === 'raise') { ... }

// Correct
if (norm(action) === 'raise') { ... }
```

### `findLastPFRaiser`

```js
const pre    = ctx.byStreet['preflop'] || [];
const opener = findLastPFRaiser(pre);
if (opener) { /* opener.player_id is the last preflop aggressor */ }
```

### `findLastAggressorIndex`

Useful for identifying callers relative to the last bet:

```js
const river  = ctx.byStreet['river'] || [];
const betIdx = findLastAggressorIndex(river);
const callers = river.slice(betIdx + 1).filter(a => norm(a) === 'call');
```

### `findNthRaiser`

Identifies 3-bets and 4-bets:

```js
const threeBetter = findNthRaiser(pre, 2); // 2nd raise = 3-bet
const fourBetter  = findNthRaiser(pre, 3); // 3rd raise = 4-bet
```

---

## Minimal Analyzer Skeleton

```js
'use strict';
const { norm } = require('./util');

const MyAnalyzer = {
  name: 'MyAnalyzer',
  analyze({ hand, byStreet, seated, positions, bbPlayerId, evaluateAt }) {
    const results = [];
    try {
      const pre = byStreet['preflop'] || [];

      for (const a of pre) {
        if (norm(a) !== 'raise') continue;
        // Example: hand-level tag
        results.push({ tag: 'MY_TAG', tag_type: 'auto' });
      }
    } catch {
      // Must not throw — return whatever we have so far
    }
    return results;
  },
};

module.exports = MyAnalyzer;
```

---

## Registering a New Analyzer

1. Create `server/game/tagAnalyzers/myAnalyzer.js` following the skeleton above.
2. Open `server/game/tagAnalyzers/index.js`.
3. Add a require at the top:
   ```js
   const MyAnalyzer = require('./myAnalyzer');
   ```
4. Add the analyzer to `ANALYZER_REGISTRY`:
   ```js
   const ANALYZER_REGISTRY = [
     StreetAnalyzer,
     PreflopAnalyzer,
     // ... existing analyzers ...
     MyAnalyzer,           // add here
   ];
   ```

Order within the registry does not affect correctness — all analyzers receive
the same `ctx` and their results are collected independently via
`Promise.allSettled`. Order only affects log readability.

---

## Tag Uniqueness and Deduplication

The pipeline in `AnalyzerService.analyzeAndTagHand` deduplicates automatically:

- Hand-level tags: deduplicated by `tag_type + tag`.
- Player-level tags: deduplicated by `tag_type + tag + player_id`.
- Action-level tags: **never** deduplicated — multiple sizing tags can exist
  for the same player on different actions.

You do not need to deduplicate within your analyzer.

---

## Testing Conventions

Tests for analyzers live in `server/game/__tests__/`. New test files added
as part of this work provide patterns to follow:

| File | What it tests |
|---|---|
| `HandGenerator.combos.test.js` | Feature isolation; one describe block per scenario; deterministic assertions repeated across random iterations |
| `RangeParser.silent.test.js` | Exhaustive bad-input coverage; each bad input type in its own `it` block |
| `SessionManager.vpip.test.js` | Stateful lifecycle tests; helper functions that build, run, and teardown sessions |

### Checklist for analyzer tests

- Test the happy path: correct input → expected tag(s) returned.
- Test no-match path: input that should produce `[]` does produce `[]`.
- Test graceful degradation: missing optional fields (e.g. no hole cards when
  `evaluateAt` is used) → analyzer returns `[]` without throwing.
- Use `expect(() => analyzer.analyze(ctx)).not.toThrow()` as a guard.
- Construct minimal ctx objects inline — do not start a real game unless you
  need the full GameManager lifecycle.

Example minimal ctx for a unit test:

```js
const ctx = {
  hand:        { board: ['Ah','Kd','Qc','Js','Th'], phase_ended: 'showdown', big_blind: 20 },
  allActions:  [],
  actions:     [],
  byStreet:    { preflop: [], flop: [], turn: [], river: [] },
  seated:      [],
  positions:   {},
  bbPlayerId:  null,
  potByStreet: { preflop: 0, flop: 30, turn: 60, river: 120 },
  evaluateAt:  () => null,
  holeCardsByPlayer: {},
};
const results = MyAnalyzer.analyze(ctx);
expect(Array.isArray(results)).toBe(true);
```

---

## Current Analyzer Reference

| Analyzer | File | Tags produced |
|---|---|---|
| StreetAnalyzer | `street.js` | `WALK`, `SAW_FLOP`, `SAW_TURN`, `SAW_RIVER`, `WENT_TO_SHOWDOWN` |
| PreflopAnalyzer | `preflop.js` | `3BET_POT`, `FOUR_BET_POT`, `SQUEEZE_POT`, `ALL_IN_PREFLOP`, `LIMPED_POT`, `BTN_OPEN`, `BLIND_DEFENSE` |
| PostflopAnalyzer | `postflop.js` | `C_BET`, `CHECK_RAISE`, `BLUFF_CATCH`, `DONK_BET`, `RIVER_RAISE` |
| PotTypeAnalyzer | `potType.js` | `WHALE_POT`, `MULTIWAY`, `SHORT_STACK`, `DEEP_STACK`, `OVERBET` |
| BoardAnalyzer | `board.js` | `MONOTONE_BOARD`, `PAIRED_BOARD` |
| MistakeAnalyzer | `mistakes.js` | `UNDO_USED`, `OPEN_LIMP`, `OVERLIMP`, `LIMP_RERAISE`, `COLD_CALL_3BET`, `FOLD_TO_PROBE`, `MIN_RAISE` |
| SizingAnalyzer | `sizing.js` | `PROBE_BET`, `THIRD_POT_BET`, `HALF_POT_BET`, `POT_BET`, `OVERBET`, `OVERBET_JAM` |
| PositionalAnalyzer | `positional.js` | `C_BET_IP`, `C_BET_OOP`, `DONK_BET_BB`, `3BET_BTN`, `3BET_SB`, `SQUEEZE_CO` |
| HandStrengthAnalyzer | `handStrength.js` | `SLOWPLAY`, `HERO_CALL`, `VALUE_MISSED`, `THIN_VALUE_RAISE` |

---

## Common Mistakes to Avoid

**Throwing instead of returning `[]`.**
The pipeline uses `Promise.allSettled`, so a thrown error is caught and logged,
but it causes the analyzer to produce no tags for that hand. Silence is worse
than a graceful `[]`.

**Comparing raw DB action strings without normalizing.**
`action.action` is stored as `'raised'` not `'raise'`. Always use `norm(a)`.

**Relying on `byStreet[street]` being defined.**
Streets that never happened (e.g. `'river'` in a hand that ended on the flop)
will be `undefined`. Always use `byStreet[street] || []`.

**Assuming `evaluateAt` returns a result.**
It returns `null` when hole cards are missing or when the board is too short
for the requested street. Always guard: `if (!result) return []`.

**Emitting the same tag multiple times for the same player.**
The pipeline deduplicates player-level tags by `tag + player_id`, but only
after all analyzers have run. If you return duplicate entries, only the first
survives. Do not rely on deduplication to clean up your analyzer's output.
