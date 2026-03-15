# Guided Replay Mode — Implementation Plan

**Status:** Design complete, not yet implemented
**Target:** Epic R1–R7
**Last updated:** 2026-03-15

---

## 1. Architecture Decision

**Replay mode lives inside `GameManager`** as a new `phase: 'replay'` value — not a separate class.

**Rationale:**
- GameManager already owns all game state, undo stacks, broadcasting, and the player map. Splitting into a ReplayManager would duplicate all of this.
- The branch mechanic (going live from a replay cursor) requires seamlessly transitioning from replay state to a live `'waiting'` phase — trivial if replay is a phase, complex if it's a separate class.
- `SessionManager` wraps `GameManager`; keeping replay inside means stats tracking still works transparently.
- All existing socket handlers, auth guards, and coach checks stay intact.

The alternative (separate `ReplayManager` class) was rejected because:
- It would require duplicating the player map, stacks, and broadcast machinery.
- Branch-to-live would require a complex hand-off between two objects.
- Tests would need a full parallel mock infrastructure.

---

## 2. Data Model

### `replay_mode` state object (added to GameManager `_initState`)

```js
replay_mode: {
  active: false,              // true when phase === 'replay'
  source_hand_id: null,       // DB hand_id being replayed
  actions: [],                // full action log from DB (ordered by sequence)
  cursor: -1,                 // index into actions[]; -1 = before any action
  player_map: {},             // stableId → { name, seat } for display
  original_hole_cards: {},    // stableId → [card, card]
  original_board: [],         // up to 5 community cards
  original_stacks: {},        // stableId → chip count at hand start
  branched: false,            // true after replay_branch until replay_unbranch/exit
  pre_branch_snapshot: null,  // full GameManager snapshot saved before branch
}
```

### DB changes required

No new tables. The existing schema already stores:
- `hands` — hand metadata, board cards, winner
- `hand_players` — per-player hole cards, starting stacks, VPIP/PFR flags
- `hand_actions` — every action with street, sequence, amount, is_reverted

New DB query needed in `HandLogger.js`:
```js
getHandForReplay(handId)
// Returns: { hand, players: [{stableId, name, seat, holeCards, startStack}], actions: [{...}] }
// Filters: is_reverted = 0 only
```

---

## 3. New GameManager Methods

### 3.1 `loadReplay(handData)`

**Guard:** `phase` must be `'waiting'`

**Behavior:**
1. Deep-clone `handData` into `this.state.replay_mode`
2. Set `replay_mode.active = true`, `cursor = -1`
3. Set `this.state.phase = 'replay'`
4. Restore players to their original seats/stacks from `original_stacks`
5. Clear all community cards, pots, bets
6. Broadcast game_state with `replay_mode` included in public state

**Returns:** `{ ok: true }` or `{ error: string }`

---

### 3.2 `replayStepForward()`

**Guard:** `phase === 'replay'` and `cursor < actions.length - 1`

**Behavior:**
1. Increment `cursor`
2. Apply `actions[cursor]` to visible game state (update player stacks, community cards, pot, current_turn)
3. Do NOT run real betting logic — only update display state to match the recorded action
4. Broadcast game_state

**Action application logic:**
- `fold`: set `player.is_active = false`
- `call` / `raise` / `bet`: update `player.stack`, `player.current_bet`, `state.pot`
- `check`: no state change
- Street transitions (detected by `action.street` changing): reveal next board cards from `original_board`

**Returns:** `{ ok: true, action: actions[cursor] }` or `{ error: 'already_at_end' }`

---

### 3.3 `replayStepBack()`

**Guard:** `phase === 'replay'` and `cursor >= 0`

**Behavior:**
1. Decrement `cursor`
2. Rebuild visible state from scratch: start from `original_stacks`, replay all actions from 0 to new `cursor`
3. Broadcast game_state

(Rebuild-from-scratch is O(n) but replay hands are at most ~50 actions — acceptable.)

**Returns:** `{ ok: true }` or `{ error: 'already_at_start' }`

---

### 3.4 `replayJumpTo(targetCursor)`

**Guard:** `phase === 'replay'` and `0 <= targetCursor < actions.length`

**Behavior:**
1. Set `cursor = targetCursor`
2. Rebuild visible state from scratch (same as stepBack)
3. Broadcast game_state

**Returns:** `{ ok: true }` or `{ error: 'out_of_range' }`

---

### 3.5 `branchFromReplay()`

**Guard:** `phase === 'replay'` and `replay_mode.branched === false`

**Behavior:**
1. Save `pre_branch_snapshot = deepClone(this.state)` (full snapshot for unbranch)
2. Set `replay_mode.branched = true`
3. Set `phase = 'waiting'`
4. Preserve current player stacks (as they are at the branch point)
5. Clear undo/rollback stacks (branch point is the new baseline)
6. Broadcast game_state with `replay_mode.branched = true` visible to clients
7. Coach can now run a live hand from this exact state using existing `start_game` / `start_configured_hand`

**Returns:** `{ ok: true }` or `{ error: string }`

---

### 3.6 `unBranchToReplay()`

**Guard:** `replay_mode.branched === true`

**Behavior:**
1. Restore `this.state = deepClone(replay_mode.pre_branch_snapshot)`
2. Broadcast game_state (returns to replay phase at the branch cursor)

**Returns:** `{ ok: true }` or `{ error: 'not_branched' }`

---

### 3.7 `exitReplay()`

**Guard:** `phase === 'replay'` or `replay_mode.branched === true`

**Behavior:**
1. Reset `replay_mode` to initial values
2. Set `phase = 'waiting'`
3. Restore player stacks from pre-replay state OR leave as-is (configurable — see edge cases)
4. Broadcast game_state

**Returns:** `{ ok: true }`

---

## 4. New Socket Events

### Client → Server

| Event | Payload | Auth | Description |
|-------|---------|------|-------------|
| `load_replay` | `{ handId }` | coach | Load a hand from DB into replay mode |
| `replay_step_forward` | `{}` | coach | Advance one action |
| `replay_step_back` | `{}` | coach | Rewind one action |
| `replay_jump_to` | `{ cursor }` | coach | Jump to specific action index |
| `replay_branch` | `{}` | coach | Branch to live play from current cursor |
| `replay_unbranch` | `{}` | coach | Return to replay after a branch |
| `replay_exit` | `{}` | coach | Exit replay mode entirely |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `replay_loaded` | `{ handId, actionCount, players }` | Confirms replay loaded successfully |

All other replay state is communicated via the existing `game_state` event (replay_mode included in public state).

---

## 5. Server Handler Code (`server/index.js`)

```js
// ── REPLAY HANDLERS ──────────────────────────────────────────────────────────

socket.on('load_replay', async ({ handId }) => {
  if (!isCoach(socket, tableId)) return;
  const handData = await db.getHandForReplay(handId);
  if (!handData) return socket.emit('error', { message: 'Hand not found' });
  const result = gm.loadReplay(handData);
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
  socket.emit('replay_loaded', {
    handId,
    actionCount: handData.actions.length,
    players: handData.players.map(p => ({ name: p.name, seat: p.seat })),
  });
});

socket.on('replay_step_forward', () => {
  if (!isCoach(socket, tableId)) return;
  const result = gm.replayStepForward();
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
});

socket.on('replay_step_back', () => {
  if (!isCoach(socket, tableId)) return;
  const result = gm.replayStepBack();
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
});

socket.on('replay_jump_to', ({ cursor }) => {
  if (!isCoach(socket, tableId)) return;
  const result = gm.replayJumpTo(cursor);
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
});

socket.on('replay_branch', () => {
  if (!isCoach(socket, tableId)) return;
  const result = gm.branchFromReplay();
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
  io.to(tableId).emit('notification', { message: 'Branched from replay — live play active from this point' });
});

socket.on('replay_unbranch', () => {
  if (!isCoach(socket, tableId)) return;
  const result = gm.unBranchToReplay();
  if (result.error) return socket.emit('error', { message: result.error });
  io.to(tableId).emit('game_state', gm.getPublicState());
});

socket.on('replay_exit', () => {
  if (!isCoach(socket, tableId)) return;
  gm.exitReplay();
  io.to(tableId).emit('game_state', gm.getPublicState());
  io.to(tableId).emit('notification', { message: 'Replay ended' });
});
```

---

## 6. `getPublicState()` Changes

Add `replay_mode` to the public state broadcast. Redact hole cards for players other than the requesting socket — **EXCEPT** in replay mode where all hole cards are visible to everyone (the teaching purpose requires full card visibility).

```js
// In getPublicState(forSocketId):
if (this.state.replay_mode.active) {
  // Expose all hole cards in replay — it's a review session
  players = players.map(p => ({
    ...p,
    hole_cards: this.state.replay_mode.original_hole_cards[p.stableId] || [],
  }));
}

return {
  ...existingFields,
  replay_mode: {
    active: this.state.replay_mode.active,
    cursor: this.state.replay_mode.cursor,
    total_actions: this.state.replay_mode.actions.length,
    branched: this.state.replay_mode.branched,
    source_hand_id: this.state.replay_mode.source_hand_id,
    current_action: this.state.replay_mode.actions[this.state.replay_mode.cursor] ?? null,
  },
};
```

---

## 7. `HandLogger.js` — New Query

```js
getHandForReplay(handId) {
  const hand = this.db.prepare(`
    SELECT * FROM hands WHERE id = ?
  `).get(handId);
  if (!hand) return null;

  const players = this.db.prepare(`
    SELECT hp.*, pi.display_name as name
    FROM hand_players hp
    JOIN player_identities pi ON pi.stable_id = hp.player_id
    WHERE hp.hand_id = ?
    ORDER BY hp.seat_number
  `).all(handId);

  const actions = this.db.prepare(`
    SELECT * FROM hand_actions
    WHERE hand_id = ? AND is_reverted = 0
    ORDER BY sequence_number
  `).all(handId);

  return {
    hand,
    players: players.map(p => ({
      stableId: p.player_id,
      name: p.name,
      seat: p.seat_number,
      holeCards: JSON.parse(p.hole_cards || '[]'),
      startStack: p.stack_start,
    })),
    actions: actions.map(a => ({
      sequence: a.sequence_number,
      playerId: a.player_id,
      street: a.street,
      action: a.action_type,
      amount: a.amount,
    })),
    board: {
      flop: hand.flop_cards ? JSON.parse(hand.flop_cards) : [],
      turn: hand.turn_card ? JSON.parse(hand.turn_card) : null,
      river: hand.river_card ? JSON.parse(hand.river_card) : null,
    },
  };
}
```

---

## 8. Client Changes

### 8.1 `useSocket.js`

```js
// New state
const [replayState, setReplayState] = useState(null); // replay_mode from game_state
const [replayLoaded, setReplayLoaded] = useState(false);

// Update in game_state handler:
if (gs.replay_mode?.active !== undefined) {
  setReplayState(gs.replay_mode);
}

// New event
socket.on('replay_loaded', ({ handId, actionCount, players }) => {
  setReplayLoaded(true);
  // optional: toast notification
});

// Emit helpers
const loadReplay = (handId) => socket.emit('load_replay', { handId });
const replayStepForward = () => socket.emit('replay_step_forward');
const replayStepBack = () => socket.emit('replay_step_back');
const replayJumpTo = (cursor) => socket.emit('replay_jump_to', { cursor });
const replayBranch = () => socket.emit('replay_branch');
const replayUnbranch = () => socket.emit('replay_unbranch');
const replayExit = () => socket.emit('replay_exit');
```

---

### 8.2 `CoachSidebar.jsx` — Replay Controls Section

New Section 11 — **Replay Controls** (visible only when `gameState.replay_mode?.active`):

```jsx
function ReplayControls({ replayState, onStepBack, onStepForward, onJumpTo, onBranch, onUnbranch, onExit }) {
  const { cursor, total_actions, branched, current_action } = replayState;

  return (
    <div className="coach-section">
      <h3>Replay Controls</h3>

      {/* Action scrubber */}
      <input
        type="range"
        min={-1}
        max={total_actions - 1}
        value={cursor}
        onChange={(e) => onJumpTo(Number(e.target.value))}
      />
      <span>{cursor + 1} / {total_actions}</span>

      {/* Step buttons */}
      <button onClick={onStepBack} disabled={cursor < 0}>◀ Back</button>
      <button onClick={onStepForward} disabled={cursor >= total_actions - 1}>Forward ▶</button>

      {/* Current action display */}
      {current_action && (
        <div className="current-action">
          {current_action.street}: {current_action.action} {current_action.amount ? `$${current_action.amount}` : ''}
        </div>
      )}

      {/* Branch controls */}
      {!branched && (
        <button onClick={onBranch} className="btn-branch">
          Branch to Live from Here
        </button>
      )}
      {branched && (
        <button onClick={onUnbranch} className="btn-unbranch">
          Return to Replay
        </button>
      )}

      <button onClick={onExit} className="btn-exit-replay">Exit Replay</button>
    </div>
  );
}
```

Also update **Section 10 — Scenario Loader** to add a "Load for Replay" button alongside the existing "Load for Config" button.

---

### 8.3 `PokerTable.jsx` — Replay Indicators

1. **Phase badge**: When `gameState.replay_mode?.active`, show `REPLAY` badge (blue) in the phase indicator. When `branched`, show `BRANCHED` badge (amber).

2. **Card reveal**: In replay mode, render all players' hole cards face-up (the `hole_cards` array will be populated by the server's `getPublicState()` which reveals all in replay).

3. **Betting controls suppression**: Hide `BettingControls` entirely when `gameState.replay_mode?.active && !gameState.replay_mode?.branched`. When branched, show controls normally.

4. **Action highlight**: Highlight the seat of `current_action.playerId` with a pulsing border to indicate whose action is being shown.

---

## 9. Branch Mechanic — Detailed Flow

The branch is the core teaching tool. Full flow:

```
1. Coach loads a hand for replay (load_replay)
   → phase = 'replay', cursor = -1

2. Coach steps through to the interesting decision point
   → cursor = 7 (e.g., after flop betting starts)

3. Coach clicks "Branch to Live from Here"
   → pre_branch_snapshot saved (full state at cursor 7)
   → phase = 'waiting'
   → branched = true
   → Players see: BRANCHED badge, betting controls visible

4. Coach (optionally) opens configure_phase to change some hole cards
   → Entire existing config flow works unchanged

5. Coach clicks Start Hand
   → Normal live hand from this board/stack state
   → Players act, coach observes/teaches

6. After live hand, coach clicks "Return to Replay"
   → State restored from pre_branch_snapshot
   → phase = 'replay', cursor = 7 again
   → branched = false

7. Coach can branch again (different line) or continue stepping forward

8. Coach clicks "Exit Replay"
   → replay_mode cleared
   → phase = 'waiting'
   → Ready for a new hand
```

---

## 10. Edge Cases

| Case | Handling |
|------|----------|
| Player in current session has no seat in the replayed hand | Show as spectator during replay; assign seat only when branching to live |
| Player present in replay but not in current session | Show as ghost seat in replay (greyed out, no socket) |
| Branch → live hand → coach disconnects | Existing coach disconnect handling applies; replay state preserved |
| exitReplay during a branched live hand | Ends hand immediately (calls gm.reset()), exits replay |
| Replay hand has different blind levels than current table | `loadReplay()` sets blinds to match the historical hand; `exitReplay()` restores prior blinds |
| Stack preservation on exitReplay | Two options: (a) restore pre-replay stacks (default), (b) keep stacks from branched live play. Expose as a coach option in the exit dialog. |
| Jumping to cursor beyond current community cards | Rebuild always derives visible board from original_board sliced by street of actions[cursor] |
| Undo/rollback during branched live play | Works normally (restores within the live branch, does NOT touch pre_branch_snapshot) |

---

## 11. Implementation Epics

### Epic R1 — Core Replay Engine (`GameManager.js` + `HandLogger.js`)

**Files:** `server/game/GameManager.js`, `server/db/HandLogger.js`

**Changes:**
- Add `replay_mode` to `_initState()`
- Implement `loadReplay()`, `replayStepForward()`, `replayStepBack()`, `replayJumpTo()`, `branchFromReplay()`, `unBranchToReplay()`, `exitReplay()`
- Update `getPublicState()` to include `replay_mode` and expose all hole cards in replay
- Add `getHandForReplay(handId)` to `HandLogger.js`

**Tests:** 30 unit tests in `GameManager.replay.test.js` (see Section 12)

---

### Epic R2 — Socket Handlers (`server/index.js`)

**Files:** `server/index.js`

**Changes:**
- Add 7 socket event handlers (load_replay, replay_step_forward, replay_step_back, replay_jump_to, replay_branch, replay_unbranch, replay_exit)
- All guarded with `isCoach` check
- `load_replay` calls `db.getHandForReplay()` then `gm.loadReplay()`

**Tests:** 20 integration tests in `server.replay.test.js`

---

### Epic R3 — SessionManager Guard

**Files:** `server/game/SessionManager.js`

**Changes:**
- In `onHandEnd()` (stats tracking): add guard `if (this.state.replay_mode?.active) return;`
  - Replay "hands" must not generate stats
- In `onHandStart()`: same guard
- Branched live hands SHOULD generate stats (branched = false when live hand runs)

**Tests:** 4 tests in existing `SessionManager.test.js`

---

### Epic R4 — Client State & Hooks (`useSocket.js`)

**Files:** `client/src/hooks/useSocket.js`

**Changes:**
- Add `replayState`, `replayLoaded` state
- Handle `replay_loaded` event
- Expose 7 emit helpers
- Pass `replayState` into game components

---

### Epic R5 — Replay Controls UI (`CoachSidebar.jsx`)

**Files:** `client/src/components/CoachSidebar.jsx`

**Changes:**
- Add `ReplayControls` component (Section 11)
- Add "Load for Replay" button to Scenario Loader (Section 10)
- Wire all emit helpers

---

### Epic R6 — Table Visual Indicators (`PokerTable.jsx`, `PlayerSeat.jsx`)

**Files:** `client/src/components/PokerTable.jsx`, `client/src/components/PlayerSeat.jsx`

**Changes:**
- REPLAY/BRANCHED phase badges
- All hole cards face-up in replay
- Betting controls hidden during replay (shown during branch)
- Active action seat highlight (pulsing border)

---

### Epic R7 — QA, Docs & Edge Case Handling

**Files:** `GETTING_STARTED.md`, `ISSUES_REGISTRY.md`

**Changes:**
- Document replay mode in GETTING_STARTED.md (Section 5, new sub-section)
- Add ISS-R* entries for any edge cases discovered during QA
- Smoke test the full branch-to-live flow manually

---

## 12. Test Plan

### 12.1 Unit Tests — `GameManager.replay.test.js` (30 tests)

```
loadReplay()
  ✓ sets phase to 'replay'
  ✓ sets replay_mode.active = true
  ✓ stores original_stacks from handData
  ✓ stores actions array (non-reverted only)
  ✓ sets cursor to -1
  ✓ rejects if phase !== 'waiting'
  ✓ returns error for missing handData
  ✓ broadcasts game_state after load

replayStepForward()
  ✓ increments cursor
  ✓ returns error 'already_at_end' at last action
  ✓ rejects if phase !== 'replay'
  ✓ applies fold action: sets player.is_active = false
  ✓ applies call action: updates player.stack and pot
  ✓ applies raise action: updates player.current_bet
  ✓ reveals flop cards at street transition

replayStepBack()
  ✓ decrements cursor
  ✓ returns error 'already_at_start' at cursor -1
  ✓ rebuilds state correctly from scratch
  ✓ rejects if phase !== 'replay'

replayJumpTo()
  ✓ sets cursor to target
  ✓ returns error 'out_of_range' for invalid cursor
  ✓ rebuilds state correctly

branchFromReplay()
  ✓ sets phase to 'waiting'
  ✓ sets branched = true
  ✓ saves pre_branch_snapshot
  ✓ rejects if already branched

unBranchToReplay()
  ✓ restores state from pre_branch_snapshot
  ✓ sets branched = false
  ✓ rejects if not branched

exitReplay()
  ✓ clears replay_mode
  ✓ sets phase to 'waiting'
  ✓ works from branched state
```

### 12.2 Integration Tests — `server.replay.test.js` (20 tests)

```
load_replay socket event
  ✓ coach can load a hand by id
  ✓ non-coach is rejected
  ✓ emits replay_loaded with correct metadata
  ✓ emits game_state with replay_mode.active = true
  ✓ returns error for invalid handId

replay navigation
  ✓ step_forward advances cursor and broadcasts
  ✓ step_back decrements cursor and broadcasts
  ✓ jump_to sets cursor and broadcasts
  ✓ step_forward at end returns error

replay_branch
  ✓ transitions to 'waiting' phase
  ✓ live start_game works after branch
  ✓ replay_unbranch restores replay state

replay_exit
  ✓ clears replay state
  ✓ phase returns to 'waiting'
  ✓ works from branched state
```

### 12.3 SessionManager Tests (4 tests)

```
  ✓ stats not tracked during replay step_forward
  ✓ stats not tracked during replay step_back
  ✓ stats ARE tracked for branched live hands
  ✓ replay exit does not trigger onHandEnd
```

### 12.4 Manual QA Checklist (10 items)

1. Load a hand from Scenario Loader → verify REPLAY badge appears on table
2. Step forward through all actions → verify cards/stacks update correctly
3. Step back to cursor 0 → verify state matches original deal
4. Jump to last action → verify correct final state
5. Branch at action 5 → verify betting controls appear, BRANCHED badge shows
6. Run a full live hand from branch point → verify stats recorded
7. Return to replay from branch → verify cursor is restored to action 5
8. Exit replay → verify phase returns to 'waiting', stacks reset
9. Load replay as spectator → verify no branch/exit controls visible
10. Coach disconnect during replay → verify game pauses, replay state preserved on reconnect

---

## 13. Files Changed Summary

| File | Change Type | Epic |
|------|-------------|------|
| `server/game/GameManager.js` | Add 7 methods, update `_initState`, update `getPublicState` | R1 |
| `server/db/HandLogger.js` | Add `getHandForReplay()` | R1 |
| `server/game/SessionManager.js` | Add replay guards in stat hooks | R3 |
| `server/index.js` | Add 7 socket handlers | R2 |
| `client/src/hooks/useSocket.js` | Add state + emit helpers | R4 |
| `client/src/components/CoachSidebar.jsx` | Add ReplayControls section | R5 |
| `client/src/components/PokerTable.jsx` | Add badges, card reveal, control suppression | R6 |
| `client/src/components/PlayerSeat.jsx` | Add action highlight | R6 |
| `server/game/__tests__/GameManager.replay.test.js` | New test file (30 tests) | R1 |
| `server/__tests__/server.replay.test.js` | New test file (20 tests) | R2 |
| `GETTING_STARTED.md` | Document replay mode | R7 |
