# Batch Simulation Testing — Reference Guide

**File:** `simulate_batches.js`
**Last updated:** 2026-03-16
**Current state:** 252 batches × 20 hands = 5,040 target hands. All complete (5040/5040). 67 known-harmless crashes, 428 known-harmless anomalies (all harness issues — no server bugs).

---

## How it works

The batch runner boots the real poker server on a random loopback port, spins up Socket.io client sockets for each player, and plays `HANDS_PER_BATCH` (= 20) hands per batch. Everything runs against a fresh `sim_results.db` SQLite file (deleted at startup) — your production DB is never touched.

### High-level flow

```
main()
  ├─ starts HTTP server on random port
  └─ for each batch:
       runBatch(port, batch)
         ├─ buildSession()     — register players, join sockets to table
         ├─ adjust stacks      — per-player or uniform
         ├─ batch.setup()      — optional async pre-batch work
         ├─ for h = 1..20:
         │    batch.beforeHand()
         │    play{Hand|ManualHand|ComboHand|ReplayHand|PlaylistHand}()
         │    batch.afterHand()
         └─ teardown()         — disconnect sockets, wait 80ms for TTL cleanup
```

---

## Running

```bash
# Full suite (all 244 batches)
node simulate_batches.js

# Range by position (1-indexed, inclusive)
node simulate_batches.js 1 10       # B01–B10
node simulate_batches.js 145        # B145 to end

# Specific batches by position (comma-separated, 1-indexed)
BATCH_IDS=201 node simulate_batches.js       # B201 only
BATCH_IDS=86,113 node simulate_batches.js    # B86 + B113

# Custom DB path
DATABASE_PATH=./my_test.db node simulate_batches.js
```

> **BATCH_IDS uses 1-indexed position** (the Nth entry in the BATCHES array), not the batch ID string. B201 is the 201st array entry → `BATCH_IDS=201`.

---

## Batch definition schema

```js
{
  id:          'B042',            // string — used in report output
  label:       'Human description',

  // Players (excluding coach — coach is always added)
  players:     ['Alice', 'Bob'],  // names must be globally unique across the file

  // Stack overrides (chips). null = use server default (100×BB = 1000)
  stacks:      null               // no override
  stacks:      { all: 500 }       // all players get 500
  stacks:      { Alice: 100, Coach: 2000 }  // per-player

  // Hand mode — controls which playXHand() function is called
  mode:        'rng'              // random cards, no config
  mode:        'manual'          // fixed hole cards + board via holeCards/boardCards
  mode:        'combos'          // combo-intersection config (preset range chips)
  mode:        'replay'          // guided replay of seeded hand IDs
  mode:        'playlist'        // activate a playlist, run sequential scenarios

  // Dynamic mode: different modes per hand number
  handMode:    (h) => h % 2 === 0 ? 'manual' : 'rng',

  // Hole cards for manual mode — static object or function of hand number
  holeCards:   { Coach: ['As','Kh'], Alice: ['Qd','Jc'] }
  holeCards:   (h) => h % 2 === 0 ? { ... } : {},

  // Board cards for manual / combo mode
  boardCards:  ['2c','7d','9h']   // up to 5; gaps are random
  boardCards:  (h) => [...],

  // Combos config for 'combos' mode (keyed by player name)
  combosConfig: { Alice: [['As','Kh'],['Ah','Kd']] }
  combosConfig: (h, allActors) => ({ ... }),

  // Board texture constraint for 'combos' mode
  boardTexture: ['flush_draw', 'unpaired'],

  // Extra config fields passed through update_hand_config for 'combos' mode
  extraConfig:  (allActors) => ({ ... }),

  // Assertion hook for 'combos' mode — called once on first preflop game_state
  onPreflop:    (state) => { assert(...) },   // throws → recorded as anomaly

  // ── Hooks ──────────────────────────────────────────────────────────────────

  // Static hooks object (same for every hand)
  hooks: {
    onState:   async (state, coachSock) => { ... },  // return 'skip' or 'abort'
    afterBet:  async (bet, coachSock) => { ... },
  },

  // Dynamic hooks factory — called fresh for each hand (h = hand number 1..20)
  hooksFactory: (h, allActors, setupCtx) => ({
    onState:    ...,
    afterBet:   ...,
    replayOps:  async (coachSock, nextState, crashes, anomalies, handNum) => { ... },
    afterConfigUpdate: async (coachSock) => { ... },
  }),

  // Lifecycle callbacks
  setup:       async (port, coachSock, allActors, crashes, anomalies) => setupCtx,
  beforeHand:  async (coachSock, allActors, handNum) => { ... },
  afterHand:   async (coachSock, allActors, handNum, lastHandId) => { ... },
}
```

---

## Hand-play functions

Five functions handle different game modes. All share the same pattern: attach `game_state` listener → play hand → detach → emit `reset_hand` → wait for `phase='waiting'`.

| Function | Mode | Notes |
|---|---|---|
| `playHand` | `rng` | Emits `start_game`; random cards |
| `playManualHand` | `manual` | Opens config, sets hole cards + board, starts configured hand |
| `playComboHand` | `combos` | Opens config, sends `hole_cards_combos` + board texture |
| `playReplayHand` | `replay` | Emits `load_replay`, runs `replayOps` callback, exits replay |
| `playPlaylistHand` | `playlist` | Emits `start_configured_hand` (playlist pre-loaded by setup) |

### `nextState(ms)` inside each function

Each play function defines a local `nextState(ms = 1500)` that returns the next queued `game_state` or waits up to `ms` ms. **Timing out rejects → recorded as a crash.** The `stateQueue/stateWaiters` pattern is a FIFO queue: if a state arrives before `nextState()` is called it is buffered; if no state arrives within the timeout the promise rejects.

### `pickAction(state)` — the bot

Randomly picks from `['fold', 'check'/'call', 'raise']` based on what's legal. Raise amount is `minRaiseTotal + random(0..2×min_raise)`, capped at player stack. All bots use the same function.

---

## Hooks system

Hooks are the primary mechanism for injecting assertions and side effects into the hand loop.

### `onState(state, coachSock)` → optional return value

Called on every `game_state` before the bot decides what to do. Return values:
- `'skip'` — skip acting on this state (loop continues to next `nextState()`)
- `'abort'` — end the hand immediately (marks done)
- anything else / undefined — proceed normally

**Important:** `onState` fires AFTER the `state.paused` check (line 184 in `playHand`). Paused states are already skipped before `onState` runs. See [Known Issues](#known-issues) for the `skipNext` pattern pitfall.

### `afterBet(bet, coachSock)`

Called after the bot emits `place_bet`. Use for side effects like pause/undo/toggle. Awaited before the loop calls `nextState()` again.

### `replayOps(coachSock, nextState, crashes, anomalies, handNum)`

Only used in `replay` mode. Called after `replay_loaded` is confirmed. Use to step forward/back, branch, assert state.

### `hooksFactory(h, allActors, setupCtx)`

Called **fresh per hand** — returns a new hooks object. Use when you need per-hand state (e.g. `done = false` that resets each hand). The alternative is `hooks:` (static object shared across all hands, state persists across hands — usually not what you want).

---

## Batch groups (B01–B244)

| Group | Batch IDs | Category |
|---|---|---|
| — | B01–B05 | Player count & stack variations |
| — | B06–B10 | Side-pot & stack edge cases |
| — | B11–B15 | Manual hole card scenarios |
| — | B16–B20 | Board texture scenarios |
| — | B21–B24 | Full table (8–9 players) |
| — | B25–B29 | `set_player_in_hand` toggles |
| — | B30–B34 | Stack manipulation (`adjust_stack`) |
| — | B35–B37 | Pause / resume |
| — | B38–B40 | Action controls (`force_next_street`, `force_fold`) |
| — | B41 | `force_next_street` with players still to act |
| — | B42–B43 | `award_pot` |
| — | B44–B46 | `reset_hand` mid-hand |
| — | B47–B48 | `set_mode` |
| — | B49–B52 | Config phase interactions |
| — | B53–B54 | Hand tagging |
| — | B55–B114 | Undo / rollback / pause combos, scenario loader, playlist, replay |
| — | B115–B124 | Playlist with shared 3-bet seed data across player counts |
| — | B125–B134 | Range / combo intersection (preset chip UI) |
| — | B135–B137 | Blind controls + BB view |
| A | B145–B150 | Action-order consistency (UTG, BB, SB sequences) |
| B | B151–B156 | Fold-win: `showdown_result` populated |
| C | B157–B162 | Coach seat assignment (highest available seat) |
| D | B163–B168 | Heads-up rules (dealer = SB, no UTG) |
| E | B169–B174 | Chip conservation (pots balance) |
| F | B175–B180 | REST API coverage (`/api/hands`, `/api/players`, stats) |
| G | B181–B186 | Dealer button rotation across hands |
| H | B187–B192 | All-in side pots (multi-player runouts) |
| I | B193–B196 | Phase sequence integrity (preflop → flop → … → waiting) |
| J | B197–B200 | Undo / rollback combinations |
| K | B201–B206 | Coach in-hand toggle (`set_player_in_hand`) |
| L | B207–B210 | Pause / resume stress |
| M | B211–B214 | Config phase guards (`open_config_phase` mid-hand, etc.) |
| N | B215–B220 | Replay edge cases (branch, unbranch, step, jump) |
| O | B221–B224 | Non-coach action guards (place_bet/undo as spectator) |
| P | B225–B230 | Player count / game state invariants |
| Q | B231–B236 | Manual config edge cases (board overlaps, missing players) |
| R | B237–B240 | Auth edge cases (wrong password, duplicate register) |
| S | B241–B244 | Regression baselines (multi-hand stability) |
| T | B245–B247 | Dead-end path fixes (all-in auto-runout, `_advanceStreet` + `startGame` fixes) |
| V | B248–B250 | Auto-playlist from manual tags (`update_hand_tags` auto-creates playlist) |
| W | B251–B252 | Coach card privacy (live=HIDDEN, replay=real cards) |

---

## Known issues (current, not bugs in the server)

These are **harness defects** — they cause false crashes or false anomalies in the batch output. They do NOT indicate real server bugs.

### KI-01 — `skipNext` pattern causes 1500ms timeout (B86, B113, ~40 crashes)

**Batches affected:** B86 (`pause + undo_action while paused`), B113 (`stress: pause + undo + rollback`)

**Root cause:** The `afterBet` hook sets `skipNext = true` and then emits `togglePause → undoAction → togglePause`. The intention is to skip the stale post-bet game_state. However, `skipNext` consumes the first state from the queue (the post-bet state), and the undo state (which may also be paused) is then silently skipped by the `state.paused` check on line 184 of `playHand`. The subsequent unpause state has `current_turn` but the hand-play loop doesn't always reach it within the timeout window, causing a `game_state timeout` error counted as a crash.

**Impact:** ~40 crashes per full run (2 batches × 20 hands each).

**Fix approach:** Replace the `afterBet` + `skipNext` pattern with an `onState` hook that fires once on the first state with a `current_turn`, does pause+undo+unpause, then returns `'skip'`. The next state from the queue will be the post-undo state and the loop proceeds normally.

**Why not fixed yet:** Harness-only issue; does not affect the actual game correctness tests that these batches also run. Fixing it properly requires restructuring these hooks.

---

### KI-02 — Intentional `sync_error` events counted as anomalies (~426 anomalies)

**Batches affected:** B48, B81, B83, B88, B90, B92, B94, B101, B204 (and several others)

**Root cause:** `onSyncError` in `playHand` unconditionally pushes every `sync_error` event to `batchAnomalies`. Some batches intentionally trigger server-side rejections (e.g. calling `set_mode` mid-hand, calling `undo` with nothing to undo, calling `place_bet` while paused). These are expected `sync_error` responses, not bugs, but the harness can't tell the difference.

**Impact:** ~426 anomalies per full run inflating the false-positive count.

**Fix approach:** Add an `expectsSyncErrors: true` flag to batch definitions and skip the anomaly push inside `onSyncError` when that flag is set. Alternatively, route sync_errors through a separate per-batch counter.

**Why not fixed yet:** Adding the flag requires auditing each affected batch to confirm which sync_errors are expected. Low priority — all 4880 hands still complete and the real signal (crash count) is unaffected.

---

### KI-03 — B229 false-positive `current_bet=10` anomaly (6 anomalies)

**Batch:** B229 (`current_bet is 0 at start of each street`)

**Root cause:** The batch asserts `state.current_bet === 0` at the start of each street. At the very beginning of preflop, `current_bet = BB = 10` (the big blind has just been posted). This is correct server behavior — the BB post sets `current_bet` before `current_turn` is assigned. The assertion fires 6 times (once per street start that happens to catch the preflop initial state).

**Impact:** 6 anomalies per full run.

**Fix approach:** Adjust B229's `onState` assertion to allow `current_bet === state.big_blind` on the first preflop action (where `state.phase === 'preflop'`).

---

## Correct baseline (after harness fixes)

Once KI-01, KI-02, KI-03 are fixed, the expected baseline is:

| Metric | Current | Expected after fixes |
|---|---|---|
| Completed | 4880/4880 | 4880/4880 |
| Crashes | 67 | ~27 (remaining non-B86/B113 crashes need investigation) |
| Anomalies | 428 | 0 |

> The ~27 remaining crashes after KI-01 is fixed should be investigated to see if they are also harness issues or real server bugs.

---

## Global helpers

| Helper | Purpose |
|---|---|
| `pickAction(state)` | Bot action selector — fold/check-call/raise randomly |
| `ensureRegistered(port, name)` | Register player via REST (or login if already exists); caches stableId |
| `buildSession(port, tableId, playerNames)` | Register + connect all players to a table; returns `{coachSock, allActors, sockets}` |
| `waitFor(socket, event, ms)` | Wait for a one-shot socket event with timeout |
| `postJSON(port, path, body)` | HTTP POST helper |
| `getJSON(port, path)` | HTTP GET helper |
| `teardown(sockets)` | Disconnect all sockets |
| `setStack(coachSock, serverId, amount)` | Emit `adjust_stack` and wait 20ms |
| `setPlayerInHand(coachSock, serverId, bool)` | Emit `set_player_in_hand` |
| `togglePause/undoAction/rollbackStreet/forceNextStreet/forceFold` | One-liner emit wrappers |
| `setup3betPlaylist(...)` | Seeds a shared cross-batch 3BET_POT playlist (B115–B124) |
| `PRESET_COMBOS` | Pre-built combo lists matching client `PRESET_META` (for combo assertions) |

---

## `allActors` shape

```js
{
  name:     'Alice',
  stableId: 'uuid-from-registration',  // stable across reconnects
  serverId: 'uuid',                     // same as stableId (assigned in buildSession)
  sock:     Socket,                     // individual player socket
  isCoach:  false,
}
```

The coach actor has `isCoach: true` and its socket is also exposed separately as `coachSock`.

---

## Adding a new batch

1. Pick the next sequential ID (e.g. `B245`).
2. Add the batch object to the `BATCHES` array in the appropriate position.
3. Choose a mode and write the assertion logic in `onState`, `onPreflop`, or `afterHand`.
4. If asserting that something does NOT happen (e.g. a player should not get `current_turn`), use `hooksFactory` (fresh state per hand) so your `done` / `fired` flags reset.
5. Run just that batch: `BATCH_IDS=245 node simulate_batches.js`
6. Confirm 20/20 completed, 0 crashes, 0 anomalies before committing.

---

## Future ideas

### Testing gaps (coverage not yet written)

- **Showdown equity assertions** — verify best hand wins; currently the server result is trusted without validation
- **All-in runout chip math** — verify total chips in = total chips out across multi-way all-in side pots with asymmetric stacks
- **Timer auto-fold** — simulate a player that never acts and verify auto-fold fires after 60s and the hand continues
- **Ghost-player TTL** — disconnect a player mid-hand, wait 60s, verify seat is cleaned up and game continues
- **Full-table (9-player) manual config** — B21–B24 only test 8-player; extend to 9
- **Range intersection empty-set fallback** — when preset combos produce 0 combos, server should fall through to RNG; no batch currently asserts the fallback cards are dealt
- **Playlist exhaustion** — verify behavior when all playlist hands have been played (should return to `waiting`)
- **Reconnect mid-hand** — disconnect a socket after preflop action, reconnect, verify hand state is correctly sent to the rejoining player
- **Concurrent tables** — run two independent sessions on the same server port simultaneously to check for state bleed

### Infrastructure improvements

- **`expectsSyncErrors` flag on batch** — suppress false-positive anomaly counting for batches that intentionally trigger `sync_error` (fixes KI-02)
- **Fix `skipNext` pattern** (KI-01) — switch B86/B113 hooks from `afterBet` + `skipNext` to `onState`-based trigger
- **Named BATCH_IDS** — allow `BATCH_IDS=B86,B113` to filter by ID string instead of numeric position
- **Per-batch anomaly categorization** — distinguish `expected_sync_error`, `assertion_failure`, `unexpected_sync_error` in the report
- **Parallel batch execution** — batches are currently sequential; independent batches (different table IDs, no shared playlist state) could run in parallel to reduce total wall time
- **Progress bar** — show a live progress indicator during long runs instead of waiting for the final report
- **JSON report output** — emit `results.json` alongside the console output for CI integration
