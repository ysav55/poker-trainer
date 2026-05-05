# Fix Tag Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the entire tag write+read pipeline — yesterday's real-player session produced 20 hands with zero tags written, and multiple consumers silently drop sizing/mistake tags even when they exist.

**Architecture:** Two isolated fixes: (1) server-side write path — patch `AutoController` and `BotTableController` to stop swallowing errors and call the analyzer; (2) read path — add `sizing_tags` to `parseTags()` and propagate through every consumer. Client components that read the wrong tag bucket are fixed last.

**Tech Stack:** Node.js/Express (server), React/Vite (client), Jest (server tests), Vitest (client tests)

---

## Root Causes (confirmed from DB)

- `hand_tags` is **empty** for all 20 hands played 2026-04-16 — tags were never written
- `AutoController._completeHand` (line 111): `.catch(() => {})` silences both `endHand` + `analyzeAndTagHand` errors
- `BotTableController._completeHand` (line 262): never calls `analyzeAndTagHand` at all
- `parseTags()` in `server/db/utils.js` has no `sizing_tags` bucket — `sizing` tags are permanently invisible to every flat-query consumer
- `PlaylistRepository.getPlaylistHands` (line 47): hard-codes `tag_type === 'auto'`, never exposes `mistake` or `sizing`
- `MistakeMatrixPanel` (line 38): reads `auto_tags` when mistakes live in `mistake_tags`

---

## Files Changed

| File | Task | Change |
|------|------|--------|
| `server/db/__tests__/utils.test.js` | 1 | CREATE — new test for `parseTags` |
| `server/db/utils.js` | 1 | Add `sizing_tags` to `parseTags` |
| `server/db/__tests__/HandRepository.test.js` | 2 | Update `parseTags` mock (line 44–48) |
| `server/db/__tests__/PlaylistRepository.test.js` | 2 | Update `parseTags` mock + fix test assertions |
| `server/db/repositories/PlaylistRepository.js` | 3 | Replace hard-coded `'auto'` filter with `parseTags` |
| `server/game/controllers/AutoController.js` | 4 | Replace `.catch(() => {})` with `log.error` |
| `server/game/controllers/__tests__/controllers.test.js` | 4 | Add test for logged error |
| `server/game/controllers/BotTableController.js` | 5 | Add `analyzeAndTagHand` call, add `_Analyzer` lazy require |
| `server/db/__tests__/botTable.integration.test.js` | 5 | Assert `analyzeAndTagHand` is called after `endHand` |
| `client/src/hooks/useHistory.js` | 6 | Add `sizing_tags` to local `parseTags` |
| `client/src/components/StatsPanel.jsx` | 6 | Add `sizing_tags` to `parseTagsFromRows` |
| `client/src/pages/HandHistoryPage.jsx` | 7 | Add `sizing_tags` to `allTags` spread |
| `client/src/components/MistakeMatrixPanel.jsx` | 8 | Read `mistake_tags` alongside `auto_tags` |
| `client/src/__tests__/MistakeMatrixPanel.test.jsx` | 8 | Add test for `mistake_tags` bucket |

---

## Task 1: Fix `parseTags` — add `sizing_tags`

**Files:**
- Create: `server/db/__tests__/utils.test.js`
- Modify: `server/db/utils.js`

- [ ] **Step 1: Write the failing test**

```js
// server/db/__tests__/utils.test.js
'use strict';

const { parseTags } = require('../utils');

describe('parseTags', () => {
  test('returns empty arrays when called with no argument', () => {
    expect(parseTags()).toEqual({
      auto_tags: [], mistake_tags: [], sizing_tags: [], coach_tags: [],
    });
  });

  test('buckets tags by tag_type', () => {
    const rows = [
      { tag: 'C_BET',      tag_type: 'auto'    },
      { tag: 'OPEN_LIMP',  tag_type: 'mistake' },
      { tag: 'HALF_POT',   tag_type: 'sizing'  },
      { tag: 'good_spot',  tag_type: 'coach'   },
    ];
    expect(parseTags(rows)).toEqual({
      auto_tags:    ['C_BET'],
      mistake_tags: ['OPEN_LIMP'],
      sizing_tags:  ['HALF_POT'],
      coach_tags:   ['good_spot'],
    });
  });

  test('sizing_tags is populated when sizing rows exist', () => {
    const rows = [
      { tag: 'POT_BET',  tag_type: 'sizing' },
      { tag: 'OVERBET',  tag_type: 'sizing' },
    ];
    const result = parseTags(rows);
    expect(result.sizing_tags).toEqual(['POT_BET', 'OVERBET']);
    expect(result.auto_tags).toEqual([]);
    expect(result.mistake_tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd c:/Users/user/poker-trainer/server
npx jest db/__tests__/utils.test.js --forceExit
```

Expected: FAIL — `sizing_tags is not a property of result`

- [ ] **Step 3: Add `sizing_tags` to `parseTags`**

Edit `server/db/utils.js` lines 27–32:

```js
/** Transform hand_tags rows into { auto_tags, mistake_tags, sizing_tags, coach_tags } arrays. */
function parseTags(hand_tags = []) {
  return {
    auto_tags:    hand_tags.filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: hand_tags.filter(t => t.tag_type === 'mistake').map(t => t.tag),
    sizing_tags:  hand_tags.filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   hand_tags.filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}
```

- [ ] **Step 4: Run to confirm PASS**

```bash
npx jest db/__tests__/utils.test.js --forceExit
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/db/utils.js server/db/__tests__/utils.test.js
git commit -m "feat: add sizing_tags to parseTags — sizing type was silently dropped"
```

---

## Task 2: Update `parseTags` mocks in existing test files

The `parseTags` mock in `HandRepository.test.js` and `PlaylistRepository.test.js` is a local copy that also omits `sizing_tags`. Fix both so tests don't break when real `parseTags` is used and stay consistent with the new contract.

**Files:**
- Modify: `server/db/__tests__/HandRepository.test.js` (line 44–48)
- Modify: `server/db/__tests__/PlaylistRepository.test.js` (line 38–42)

- [ ] **Step 1: Update mock in HandRepository.test.js**

Find the `parseTags` mock at lines 44–48 and update:

```js
parseTags: jest.fn((tags) => ({
  auto_tags:    (tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
  mistake_tags: (tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
  sizing_tags:  (tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
  coach_tags:   (tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
})),
```

- [ ] **Step 2: Update mock in PlaylistRepository.test.js**

Find the `parseTags` mock (around line 38–42) and update:

```js
parseTags: jest.fn((tags) => ({
  auto_tags:    (tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
  mistake_tags: (tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
  sizing_tags:  (tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
  coach_tags:   (tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
})),
```

- [ ] **Step 3: Run all repository tests to confirm no regressions**

```bash
cd c:/Users/user/poker-trainer/server
npx jest db/__tests__/HandRepository.test.js db/__tests__/PlaylistRepository.test.js --forceExit
```

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add server/db/__tests__/HandRepository.test.js server/db/__tests__/PlaylistRepository.test.js
git commit -m "test: update parseTags mocks to include sizing_tags"
```

---

## Task 3: Fix `PlaylistRepository` — stop hard-coding `tag_type === 'auto'`

**Files:**
- Modify: `server/db/repositories/PlaylistRepository.js` (line 47)
- Modify: `server/db/__tests__/PlaylistRepository.test.js` (add sizing/mistake assertions)

- [ ] **Step 1: Write the failing test**

In `server/db/__tests__/PlaylistRepository.test.js`, find the `getPlaylistHands` describe block (around line 165) and add a new test after the existing ones:

```js
test('returns mistake_tags and sizing_tags, not just auto_tags', async () => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({
          data: [{
            playlist_id: 'pl-001',
            hand_id:     'h-99',
            display_order: 0,
            hands: {
              board: [],
              final_pot: 200,
              winner_name: 'Alice',
              phase_ended: 'showdown',
              hand_tags: [
                { tag: 'C_BET',     tag_type: 'auto'    },
                { tag: 'OPEN_LIMP', tag_type: 'mistake' },
                { tag: 'POT_BET',   tag_type: 'sizing'  },
              ],
            },
          }],
          error: null,
        }),
      }),
    }),
  });

  const result = await getPlaylistHands('pl-001');
  expect(result[0].auto_tags).toEqual(['C_BET']);
  expect(result[0].mistake_tags).toEqual(['OPEN_LIMP']);
  expect(result[0].sizing_tags).toEqual(['POT_BET']);
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd c:/Users/user/poker-trainer/server
npx jest db/__tests__/PlaylistRepository.test.js --forceExit
```

Expected: FAIL — `result[0].mistake_tags` is undefined

- [ ] **Step 3: Fix PlaylistRepository.js**

In `server/db/repositories/PlaylistRepository.js`, first verify that `parseTags` is importable from `../utils` (it already imports `{ q }` — add `parseTags`):

```js
// line 5 — change:
const { q } = require('../utils');
// to:
const { q, parseTags } = require('../utils');
```

Then replace line 47:

```js
// BEFORE:
auto_tags:     (row.hands?.hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),

// AFTER:
...parseTags(row.hands?.hand_tags ?? []),
```

- [ ] **Step 4: Run to confirm PASS**

```bash
npx jest db/__tests__/PlaylistRepository.test.js --forceExit
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/db/repositories/PlaylistRepository.js server/db/__tests__/PlaylistRepository.test.js
git commit -m "fix: PlaylistRepository.getPlaylistHands now returns mistake_tags and sizing_tags"
```

---

## Task 4: Fix `AutoController` — replace silent catch with error logging

**Files:**
- Modify: `server/game/controllers/AutoController.js`
- Modify: `server/game/controllers/__tests__/controllers.test.js`

- [ ] **Step 1: Write the failing test**

In `server/game/controllers/__tests__/controllers.test.js`, add a new mock and test inside the `describe('AutoController', ...)` block.

First, add a logger mock at the top of the file with the other mocks:

```js
jest.mock('../../../logs/logger', () => ({
  error: jest.fn(),
  info:  jest.fn(),
  debug: jest.fn(),
}));
```

Then inside `describe('AutoController', ...)` add this test after the existing tests:

```js
test('_completeHand logs error when analyzeAndTagHand rejects', async () => {
  const log = require('../../../logs/logger');
  const HandLogger = require('../../../db/HandLoggerSupabase');
  const AnalyzerService = require('../../../game/AnalyzerService');

  const ss = require('../../../state/SharedState');
  const handId = 'hand-err-test';
  ss.activeHands.set('table-2', { handId, sessionId: null });

  HandLogger.endHand.mockResolvedValueOnce(undefined);
  AnalyzerService.analyzeAndTagHand.mockRejectedValueOnce(new Error('DB write failed'));

  ctrl._handActive = true;
  // Restore _startHand for this test since _completeHand calls onHandComplete which calls it
  ctrl._startHand.mockResolvedValue(undefined);

  await ctrl._completeHand();

  // Wait for the floating promise chain to settle
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(log.error).toHaveBeenCalledWith(
    'game',
    'hand_completion_failed',
    expect.stringContaining('AutoController'),
    expect.objectContaining({ handId })
  );
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd c:/Users/user/poker-trainer/server
npx jest game/controllers/__tests__/controllers.test.js --forceExit
```

Expected: FAIL — `log.error` was not called

- [ ] **Step 3: Fix AutoController.js**

At the top of `server/game/controllers/AutoController.js`, add logger (use lazy require to match the file's existing pattern):

```js
// Add after existing lazy-require helpers (around line 11):
function _log() { return require('../../logs/logger'); }
```

Then replace lines 110–111:

```js
// BEFORE:
      ).then(() => _Analyzer().analyzeAndTagHand(handInfo.handId))
        .catch(() => {});

// AFTER:
      ).then(() => _Analyzer().analyzeAndTagHand(handInfo.handId))
        .catch(err => _log().error('game', 'hand_completion_failed',
          '[AutoController] endHand or analyzeAndTagHand failed',
          { err, handId: handInfo.handId, tableId: this.tableId }
        ));
```

- [ ] **Step 4: Run to confirm PASS**

```bash
npx jest game/controllers/__tests__/controllers.test.js --forceExit
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/game/controllers/AutoController.js server/game/controllers/__tests__/controllers.test.js
git commit -m "fix: AutoController._completeHand logs errors instead of swallowing them silently"
```

---

## Task 5: Fix `BotTableController` — call `analyzeAndTagHand` after `endHand`

**Files:**
- Modify: `server/game/controllers/BotTableController.js`
- Modify: `server/db/__tests__/botTable.integration.test.js`

- [ ] **Step 1: Inspect the integration test setup**

Read `server/db/__tests__/botTable.integration.test.js` — find where `analyzeAndTagHand` is mocked and where `_completeHand` behavior is exercised. Confirm the mock at the top of the file:

```js
// Should already exist — confirm it's there:
analyzeAndTagHand: jest.fn().mockResolvedValue([]),
```

If missing, it needs to be added to the `HandLoggerSupabase` mock.

- [ ] **Step 2: Add a test that asserts `analyzeAndTagHand` is called**

Find the `describe` block for `_completeHand` in `botTable.integration.test.js`, or add a new one. Add:

```js
test('_completeHand calls analyzeAndTagHand after endHand resolves', async () => {
  const HandLogger = require('../../db/HandLoggerSupabase');
  const { analyzeAndTagHand } = require('../../game/AnalyzerService');

  // The SS must have an activeHand entry for _completeHand to proceed
  const ss = require('../../state/SharedState');
  const handId = 'bot-analyze-test';
  ss.activeHands.set(ctrl.tableId, { handId, sessionId: null });

  ctrl._handActive = true;
  HandLogger.endHand.mockResolvedValueOnce(undefined);
  analyzeAndTagHand.mockResolvedValueOnce([]);

  await ctrl._completeHand();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(HandLogger.endHand).toHaveBeenCalledWith(
    expect.objectContaining({ handId })
  );
  expect(analyzeAndTagHand).toHaveBeenCalledWith(handId);
});
```

- [ ] **Step 3: Run to confirm FAIL**

```bash
cd c:/Users/user/poker-trainer/server
npx jest db/__tests__/botTable.integration.test.js --forceExit
```

Expected: FAIL — `analyzeAndTagHand` was not called

- [ ] **Step 4: Fix BotTableController.js**

In `server/game/controllers/BotTableController.js`, add `_Analyzer` lazy require. Check line 32 — it already has `_HandLogger`. Add directly after it:

```js
function _HandLogger()  { return require('../../db/HandLoggerSupabase'); }
function _Analyzer()    { return require('../AnalyzerService'); }  // ADD THIS
function _SharedState() { return require('../../state/SharedState'); }
```

Then replace lines 258–262:

```js
// BEFORE:
      _HandLogger().endHand({
        handId:         handInfo.handId,
        state:          stateCopy,
        socketToStable: Object.fromEntries(ss.stableIdMap),
      }).catch(() => {});

// AFTER:
      _HandLogger().endHand({
        handId:         handInfo.handId,
        state:          stateCopy,
        socketToStable: Object.fromEntries(ss.stableIdMap),
      }).then(() => _Analyzer().analyzeAndTagHand(handInfo.handId))
        .catch(err => console.error('[BotTableController] endHand/analyzeAndTagHand failed:', err, handInfo.handId));
```

- [ ] **Step 5: Run to confirm PASS**

```bash
npx jest db/__tests__/botTable.integration.test.js --forceExit
```

Expected: ALL PASS

- [ ] **Step 6: Run full server suite for regressions**

```bash
npx jest --forceExit
```

Expected: all tests pass (or same pass count as before — do not accept new failures)

- [ ] **Step 7: Commit**

```bash
git add server/game/controllers/BotTableController.js server/db/__tests__/botTable.integration.test.js
git commit -m "fix: BotTableController now calls analyzeAndTagHand — bot hands were never tagged"
```

---

## Task 6: Fix client `parseTags` — add `sizing_tags`

**Files:**
- Modify: `client/src/hooks/useHistory.js` (lines 4–9)
- Modify: `client/src/components/StatsPanel.jsx` (lines 4–8)

No separate test for these small helper functions — they are covered implicitly by the component tests that pass tag data through. Just make the changes and run the full client suite.

- [ ] **Step 1: Update `useHistory.js`**

```js
// Lines 4–9 — BEFORE:
function parseTags(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

// AFTER:
function parseTags(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    sizing_tags:  (hand_tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}
```

- [ ] **Step 2: Update `StatsPanel.jsx`**

```js
// Lines 4–8 — BEFORE:
function parseTagsFromRows(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

// AFTER:
function parseTagsFromRows(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    sizing_tags:  (hand_tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}
```

- [ ] **Step 3: Run client tests**

```bash
cd c:/Users/user/poker-trainer/client
npm test
```

Expected: ALL PASS — no regressions

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useHistory.js client/src/components/StatsPanel.jsx
git commit -m "fix: add sizing_tags to client parseTags — sizing type was silently dropped"
```

---

## Task 7: Fix `HandHistoryPage` — render `sizing_tags` row

The `TAG_TYPE_COLORS.sizing` color is already defined (green: `#3fb950`) — just needs to be included in the `allTags` spread.

**Files:**
- Modify: `client/src/pages/HandHistoryPage.jsx` (lines 307–311)

- [ ] **Step 1: Update the `allTags` spread**

```jsx
// Lines 307–311 — BEFORE:
const allTags = [
  ...(hand.auto_tags    || []).map(t => ({ tag: t, type: 'auto'    })),
  ...(hand.mistake_tags || []).map(t => ({ tag: t, type: 'mistake' })),
  ...(hand.coach_tags   || []).map(t => ({ tag: t, type: 'coach'   })),
];

// AFTER:
const allTags = [
  ...(hand.auto_tags    || []).map(t => ({ tag: t, type: 'auto'    })),
  ...(hand.mistake_tags || []).map(t => ({ tag: t, type: 'mistake' })),
  ...(hand.sizing_tags  || []).map(t => ({ tag: t, type: 'sizing'  })),
  ...(hand.coach_tags   || []).map(t => ({ tag: t, type: 'coach'   })),
];
```

- [ ] **Step 2: Run client tests**

```bash
cd c:/Users/user/poker-trainer/client
npm test
```

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/HandHistoryPage.jsx
git commit -m "fix: HandHistoryPage now renders sizing_tags using existing TAG_TYPE_COLORS.sizing"
```

---

## Task 8: Fix `MistakeMatrixPanel` — read `mistake_tags` bucket

The panel currently reads `auto_tags` and `coach_tags` and filters by `MISTAKE_TAG_NAMES`. But player mistakes from the analyzer have `tag_type='mistake'` → they land in `mistake_tags`. The panel sees zero mistakes.

**Files:**
- Modify: `client/src/components/MistakeMatrixPanel.jsx` (lines 37–40)
- Modify: `client/src/__tests__/MistakeMatrixPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

In `client/src/__tests__/MistakeMatrixPanel.test.jsx`, add after the existing tests:

```jsx
test('uses mistake_tags bucket in addition to auto_tags', async () => {
  const hands = [
    {
      hero_hole_cards: ['As', 'Ks'],
      auto_tags:    [],
      mistake_tags: ['OPEN_LIMP'],  // mistake from analyzer
      coach_tags:   [],
    },
  ];

  render(<MistakeMatrixPanel hands={hands} visible={true} loading={false} />);

  // AKs group should appear in the heatmap since it has a mistake
  await waitFor(() => {
    expect(screen.queryByText(/AKs/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/MistakeMatrixPanel.test.jsx
```

Expected: FAIL — AKs group not found (panel ignores `mistake_tags`)

- [ ] **Step 3: Fix MistakeMatrixPanel.jsx**

Replace lines 37–40:

```jsx
// BEFORE:
const tags = [
  ...(Array.isArray(hand.auto_tags)   ? hand.auto_tags   : []),
  ...(Array.isArray(hand.coach_tags)  ? hand.coach_tags  : []),
].filter(t => isMistakeTag(t));

// AFTER:
const tags = [
  ...(Array.isArray(hand.auto_tags)    ? hand.auto_tags    : []),
  ...(Array.isArray(hand.mistake_tags) ? hand.mistake_tags : []),
  ...(Array.isArray(hand.coach_tags)   ? hand.coach_tags   : []),
].filter(t => isMistakeTag(t));
```

- [ ] **Step 4: Run to confirm PASS**

```bash
npx vitest run src/__tests__/MistakeMatrixPanel.test.jsx
```

Expected: ALL PASS

- [ ] **Step 5: Run full client suite**

```bash
cd c:/Users/user/poker-trainer/client
npm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/MistakeMatrixPanel.jsx client/src/__tests__/MistakeMatrixPanel.test.jsx
git commit -m "fix: MistakeMatrixPanel reads mistake_tags bucket — analyzer mistakes were invisible in heatmap"
```

---

## Verification Checklist

After all tasks are complete:

### Server tests
```bash
cd c:/Users/user/poker-trainer/server
npx jest --forceExit
```
Expected: all tests pass

### Client tests
```bash
cd c:/Users/user/poker-trainer/client
npm test
```
Expected: all tests pass

### Smoke test on staging (after deploy)
1. Create a table, sit 2+ players, play 3 hands to completion
2. Query DB:
```sql
SELECT hand_id, COUNT(*) as tag_count, array_agg(DISTINCT tag_type) as types
FROM hand_tags
WHERE hand_id IN (SELECT hand_id FROM hands ORDER BY started_at DESC LIMIT 5)
GROUP BY hand_id;
```
Expected: each hand has multiple tags across `auto`, `mistake`, `sizing` types

3. Open HandHistoryPage → confirm sizing tags render in green
4. Open MistakeMatrixPanel → confirm mistake hand groups appear
