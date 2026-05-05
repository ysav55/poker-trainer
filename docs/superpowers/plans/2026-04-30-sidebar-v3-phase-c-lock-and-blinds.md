# Sidebar v3 — Phase C: Single-Coach Lock + Pending Blinds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate multi-coach race conditions on coached_cash tables (single-coach lock) and ship the pending-blinds-at-next-hand workflow that the Setup tab needs.

**Architecture:** Two new in-memory `Map`s in `SharedState` — `activeCoachLocks: Map<tableId, coachStableId>` and `pendingBlinds: Map<tableId, {sb,bb,queuedBy,queuedAt}>`. Lock claim/release tied to socket `join_room` and `disconnect` lifecycle. Pending blinds delta consumed by `GameManager` on hand reset. New socket events `coach:apply_blinds_at_next_hand` and `coach:discard_pending_blinds`. Client gets `gameState.pending_blinds` and a `PendingBlindsBanner` component on Setup tab.

**Tech Stack:** Node + Express + Socket.io server. React + Vite + Vitest client. Existing Jest server suite. No DB changes.

**Spec:** [docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md](../specs/2026-04-30-sidebar-v3-spec.md), Phase C in Section 10. RBAC behavior in Section 6.2. Pending blinds in Sections 4.3, 5.5, 7.1.

**Prereq:** Phase A merged. Phase B (Notes) can ship in parallel — Phase C is independent.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/state/SharedState.js` | Modify | Add `activeCoachLocks` and `pendingBlinds` Maps + accessor exports |
| `server/socket/handlers/joinRoom.js` | Modify | Claim coach lock on `actingAsCoach=true` join; deny + downgrade if held by another stableId |
| `server/socket/handlers/disconnect.js` | Modify | Release coach lock if last socket from that stableId leaves the room |
| `server/socket/handlers/coachControls.js` | Modify | Add `coach:apply_blinds_at_next_hand`, `coach:discard_pending_blinds` handlers |
| `server/game/GameManager.js` | Modify | Hand-reset hook reads pending delta, applies to blinds, clears pending |
| `server/game/SessionManager.js` (or wherever public state is built) | Modify | Surface `pending_blinds` on the public `gameState` object emitted to clients |
| `server/lifecycle/tableCleanup.js` | Modify | Clear `pendingBlinds.delete(tableId)` and `activeCoachLocks.delete(tableId)` on table close |
| `server/socket/__tests__/coachLock.test.js` | Create | Lock claim/release/multi-tab/different-coach tests |
| `server/socket/__tests__/pendingBlinds.test.js` | Create | Queue/apply/discard/expire tests |
| `client/src/components/sidebar-v3/PendingBlindsBanner.jsx` | Create | Banner shown when `phase !== 'waiting'` AND form blinds dirty |
| `client/src/components/sidebar-v3/TabSetup.jsx` | Modify | BlindsSection: route Apply Now vs Apply at Next Hand based on phase; mount banner |
| `client/src/components/sidebar-v3/buildLiveData.js` | Modify | Surface `pending_blinds` on adapter output |
| `client/src/components/sidebar-v3/__tests__/PendingBlindsBanner.test.jsx` | Create | Banner render gate + Discard Pending click |
| `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx` | Modify | Add Apply-at-Next-Hand path tests |
| `client/src/hooks/useGameState.js` | Modify | Wire new emit helpers `applyBlindsAtNextHand` and `discardPendingBlinds` |

---

## Task 1: `SharedState` — add `activeCoachLocks` and `pendingBlinds` Maps

**Files:**
- Modify: `server/state/SharedState.js`
- Test: `server/tests/SharedState.coachLock.test.js`

- [ ] **Step 1.1: Failing test**

Create `server/tests/SharedState.coachLock.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');

const SharedState = require('../state/SharedState.js');

describe('SharedState — activeCoachLocks', () => {
  beforeEach(() => {
    SharedState.activeCoachLocks.clear();
  });

  it('exposes a Map keyed by tableId', () => {
    expect(SharedState.activeCoachLocks).toBeInstanceOf(Map);
  });

  it('claim/release roundtrip', () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
    SharedState.activeCoachLocks.delete('t1');
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });
});

describe('SharedState — pendingBlinds', () => {
  beforeEach(() => {
    SharedState.pendingBlinds.clear();
  });

  it('exposes a Map keyed by tableId', () => {
    expect(SharedState.pendingBlinds).toBeInstanceOf(Map);
  });

  it('stores {sb, bb, queuedBy, queuedAt}', () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 123 });
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 25, bb: 50 });
  });
});
```

- [ ] **Step 1.2: Run, verify failure**

Run: `cd server && npx jest tests/SharedState.coachLock.test.js`
Expected: FAIL — Maps not exported.

- [ ] **Step 1.3: Add Maps to SharedState**

Edit `server/state/SharedState.js`. Add near the existing Maps:

```js
const activeCoachLocks = new Map();   // tableId -> coachStableId
const pendingBlinds = new Map();       // tableId -> { sb, bb, queuedBy, queuedAt }
```

Add to module.exports object:

```js
module.exports = {
  // ...existing exports
  activeCoachLocks,
  pendingBlinds,
};
```

If `SharedState` exports a named API (e.g., functions like `getTable(id)`), follow the same pattern — add helper functions `claimCoachLock(tableId, stableId)`, `releaseCoachLock(tableId, stableId)`, `setPendingBlinds(tableId, delta)`, `clearPendingBlinds(tableId)`. Read the existing file to match its conventions.

- [ ] **Step 1.4: Run, verify pass**

Run: `cd server && npx jest tests/SharedState.coachLock.test.js`
Expected: PASS.

- [ ] **Step 1.5: Commit**

```bash
git add server/state/SharedState.js \
        server/tests/SharedState.coachLock.test.js
git commit -m "$(cat <<'EOF'
feat(state): add activeCoachLocks and pendingBlinds Maps to SharedState

In-memory state for Phase C single-coach lock and pending-blinds queue.
Both keyed by tableId. Released by table close (tableCleanup) and
server restart. Spec sections 4.3, 6.4.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Single-coach lock — claim on `join_room`

**Files:**
- Modify: `server/socket/handlers/joinRoom.js`
- Test: `server/socket/__tests__/coachLock.test.js`

- [ ] **Step 2.1: Failing test**

Create `server/socket/__tests__/coachLock.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

const SharedState = require('../../state/SharedState.js');

function makeSocket({ stableId = 'coach-a', isCoach = true, role = 'coach' } = {}) {
  return {
    data: { stableId, isCoach, role, userId: stableId },
    join: jest.fn(),
    emit: jest.fn(),
    rooms: new Set(),
  };
}

beforeEach(() => {
  SharedState.activeCoachLocks.clear();
  SharedState.pendingBlinds.clear();
});

describe('coach lock — claim on join_room (acting as coach)', () => {
  it('first coach claims the lock', async () => {
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket();
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(true);
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
  });

  it('same coach reconnecting reclaims the lock (multi-tab safe)', async () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'coach-a' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(true);
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
  });

  it('different coach is denied and downgraded to observer', async () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'coach-b' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(false);
    expect(result.reason).toBe('coach_lock_held');
  });

  it('non-coach (actingAsCoach=false) does not claim a lock', async () => {
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'student-x', isCoach: false, role: 'coached_student' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: false });
    expect(result.granted).toBe(true); // observer/student joins are always allowed
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run, verify failure**

Run: `cd server && npx jest socket/__tests__/coachLock.test.js`
Expected: FAIL — `claimCoachLockIfActingAsCoach` not exported.

- [ ] **Step 2.3: Implement claim function in joinRoom**

Edit `server/socket/handlers/joinRoom.js`. Add a new exported helper:

```js
const SharedState = require('../../state/SharedState.js');

function claimCoachLockIfActingAsCoach(socket, { tableId, actingAsCoach }) {
  if (!actingAsCoach) return { granted: true };
  const stableId = socket.data?.stableId ?? socket.data?.userId;
  if (!stableId) return { granted: false, reason: 'no_stable_id' };

  const current = SharedState.activeCoachLocks.get(tableId);
  if (!current) {
    SharedState.activeCoachLocks.set(tableId, stableId);
    return { granted: true };
  }
  if (current === stableId) {
    return { granted: true }; // same coach reconnecting / multi-tab
  }
  return { granted: false, reason: 'coach_lock_held' };
}

module.exports = {
  // ...existing exports
  claimCoachLockIfActingAsCoach,
};
```

In the existing `join_room` handler body, BEFORE calling `socket.join(tableId)` and setting `socket.data.isCoach`, call this helper. If denied with `coach_lock_held`, set `socket.data.isCoach = false` (downgrade to observer) and emit a notification:

```js
const lockResult = claimCoachLockIfActingAsCoach(socket, { tableId, actingAsCoach });
if (!lockResult.granted && lockResult.reason === 'coach_lock_held') {
  socket.data.isCoach = false;
  socket.emit('notification', {
    level: 'info',
    message: 'Another coach is currently active on this table. You have joined as an observer.',
  });
}
// ...continue with existing join logic
```

- [ ] **Step 2.4: Run, verify pass**

Run: `cd server && npx jest socket/__tests__/coachLock.test.js`
Expected: PASS for all 4 cases.

- [ ] **Step 2.5: Commit**

```bash
git add server/socket/handlers/joinRoom.js \
        server/socket/__tests__/coachLock.test.js
git commit -m "$(cat <<'EOF'
feat(socket): claim coach lock on join_room (single-coach guard)

Only one coach can have actingAsCoach=true on a coached_cash table at
a time. Same stableId reclaims (multi-tab safe). Different coach is
silently downgraded to observer with a notification. Spec section 6.2.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Coach lock — release on `disconnect` (last socket leaves)

**Files:**
- Modify: `server/socket/handlers/disconnect.js`
- Modify: `server/socket/__tests__/coachLock.test.js`

- [ ] **Step 3.1: Failing test**

Append to `server/socket/__tests__/coachLock.test.js`:

```js
describe('coach lock — release on disconnect', () => {
  it('releases when the lock-holder socket disconnects and no other sockets from same stableId remain', () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const release = require('../handlers/disconnect.js').releaseCoachLockIfHeld;
    const io = { sockets: { adapter: { rooms: new Map() } } };
    // No remaining sockets in the room from coach-a
    release({ io, tableId: 't1', stableId: 'coach-a' });
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });

  it('keeps the lock when another socket from same stableId remains', () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const release = require('../handlers/disconnect.js').releaseCoachLockIfHeld;
    const io = {
      sockets: {
        adapter: { rooms: new Map([['t1', new Set(['otherSocketId'])]]) },
        sockets: new Map([['otherSocketId', { data: { stableId: 'coach-a' } }]]),
      },
    };
    release({ io, tableId: 't1', stableId: 'coach-a' });
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
  });
});
```

- [ ] **Step 3.2: Run, verify failure**

Expected: FAIL — `releaseCoachLockIfHeld` not exported.

- [ ] **Step 3.3: Implement release**

Edit `server/socket/handlers/disconnect.js`. Add helper:

```js
const SharedState = require('../../state/SharedState.js');

function releaseCoachLockIfHeld({ io, tableId, stableId }) {
  const current = SharedState.activeCoachLocks.get(tableId);
  if (current !== stableId) return; // not our lock

  // Are there other sockets from same stableId still in the room?
  const room = io.sockets.adapter.rooms.get(tableId);
  if (room) {
    for (const socketId of room) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock?.data?.stableId === stableId) return; // another tab still in room
    }
  }
  // Last socket left — release
  SharedState.activeCoachLocks.delete(tableId);
}

module.exports = {
  // ...existing
  releaseCoachLockIfHeld,
};
```

In the existing `disconnect` handler body, after the existing cleanup, call:

```js
const tableId = socket.data?.currentTableId;
const stableId = socket.data?.stableId;
if (tableId && stableId) {
  releaseCoachLockIfHeld({ io, tableId, stableId });
}
```

(Adapt to wherever the existing handler tracks `currentTableId` — read the file first.)

- [ ] **Step 3.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add server/socket/handlers/disconnect.js \
        server/socket/__tests__/coachLock.test.js
git commit -m "$(cat <<'EOF'
feat(socket): release coach lock on last-socket disconnect

Multi-tab coach holds the lock until ALL sockets from that stableId
leave the room. Cleans up cleanly when last tab closes. Spec 6.2.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `coach:apply_blinds_at_next_hand` socket handler

**Files:**
- Modify: `server/socket/handlers/coachControls.js`
- Test: `server/socket/__tests__/pendingBlinds.test.js`

- [ ] **Step 4.1: Failing test**

Create `server/socket/__tests__/pendingBlinds.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

const SharedState = require('../../state/SharedState.js');

function makeSocket({ stableId = 'coach-a', isCoach = true } = {}) {
  return {
    data: { stableId, isCoach, userId: stableId },
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    broadcast: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
  };
}

beforeEach(() => {
  SharedState.pendingBlinds.clear();
});

describe('coach:apply_blinds_at_next_hand', () => {
  it('queues a delta for the table', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 25, bb: 50 }, ack);
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 25, bb: 50, queuedBy: 'coach-a' });
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects non-coach', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 25, bb: 50 }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('validates sb < bb and integers > 0', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 50, bb: 25 }, ack); // sb >= bb
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_blinds' }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('re-queueing overwrites the previous delta (single-pending rule)', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 10, bb: 20, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    await handler(sock, { tableId: 't1', sb: 50, bb: 100 }, jest.fn());
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 50, bb: 100 });
  });
});
```

- [ ] **Step 4.2: Run, verify failure**

Run: `cd server && npx jest socket/__tests__/pendingBlinds.test.js`
Expected: FAIL — handler not exported.

- [ ] **Step 4.3: Implement handler**

Edit `server/socket/handlers/coachControls.js`. Add:

```js
const { requireCoach } = require('../../auth/socketGuards.js');
const SharedState = require('../../state/SharedState.js');

async function handleApplyBlindsAtNextHand(socket, payload, ack) {
  if (requireCoach(socket, 'apply blinds at next hand')) {
    return ack?.({ error: 'coach_only' });
  }
  const { tableId, sb, bb } = payload || {};
  if (!tableId) return ack?.({ error: 'invalid_table' });
  if (!Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb <= 0 || sb >= bb) {
    return ack?.({ error: 'invalid_blinds' });
  }
  SharedState.pendingBlinds.set(tableId, {
    sb, bb,
    queuedBy: socket.data.stableId ?? socket.data.userId,
    queuedAt: Date.now(),
  });
  // Broadcast to room so other clients update their banner
  socket.to(tableId).emit('pending_blinds_updated', { sb, bb });
  socket.emit('pending_blinds_updated', { sb, bb });
  return ack?.({ ok: true });
}

module.exports = {
  // ...existing
  handleApplyBlindsAtNextHand,
};
```

Register the handler in the socket setup (where other `coach:*` events are wired). Find the existing pattern (e.g., `socket.on('coach:adjust_stack', ...)`) and add:

```js
socket.on('coach:apply_blinds_at_next_hand', (payload, ack) => handleApplyBlindsAtNextHand(socket, payload, ack));
```

- [ ] **Step 4.4: Run, verify pass**

Expected: PASS for 4 cases.

- [ ] **Step 4.5: Commit**

```bash
git add server/socket/handlers/coachControls.js \
        server/socket/__tests__/pendingBlinds.test.js
git commit -m "$(cat <<'EOF'
feat(socket): coach:apply_blinds_at_next_hand handler

Queues a {sb, bb} delta in SharedState.pendingBlinds keyed by tableId.
Single-pending rule: re-queueing overwrites. Validates sb>0, bb>sb,
integer. Broadcasts pending_blinds_updated to room. Spec 5.5, 7.1.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `coach:discard_pending_blinds` socket handler

**Files:**
- Modify: `server/socket/handlers/coachControls.js`
- Modify: `server/socket/__tests__/pendingBlinds.test.js`

- [ ] **Step 5.1: Failing test**

Append to `server/socket/__tests__/pendingBlinds.test.js`:

```js
describe('coach:discard_pending_blinds', () => {
  it('clears the pending entry', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('is a no-op if nothing pending', async () => {
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects non-coach', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'coach_only' }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(true); // unchanged
  });
});
```

- [ ] **Step 5.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 5.3: Implement handler**

Add to `server/socket/handlers/coachControls.js`:

```js
async function handleDiscardPendingBlinds(socket, payload, ack) {
  if (requireCoach(socket, 'discard pending blinds')) {
    return ack?.({ error: 'coach_only' });
  }
  const { tableId } = payload || {};
  if (!tableId) return ack?.({ error: 'invalid_table' });
  SharedState.pendingBlinds.delete(tableId);
  socket.to(tableId).emit('pending_blinds_updated', null);
  socket.emit('pending_blinds_updated', null);
  return ack?.({ ok: true });
}

module.exports = {
  // ...existing
  handleDiscardPendingBlinds,
};
```

Register the socket event:

```js
socket.on('coach:discard_pending_blinds', (payload, ack) => handleDiscardPendingBlinds(socket, payload, ack));
```

- [ ] **Step 5.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add server/socket/handlers/coachControls.js \
        server/socket/__tests__/pendingBlinds.test.js
git commit -m "$(cat <<'EOF'
feat(socket): coach:discard_pending_blinds handler

Drops the queued blind delta for a table. Idempotent. Broadcasts
pending_blinds_updated(null). Coach-only. Spec 5.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `GameManager` consumes pending blinds on hand reset

**Files:**
- Modify: `server/game/GameManager.js`
- Test: `server/tests/GameManager.pendingBlinds.test.js`

- [ ] **Step 6.1: Failing test**

Create `server/tests/GameManager.pendingBlinds.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');
const SharedState = require('../state/SharedState.js');
const GameManager = require('../game/GameManager.js');

describe('GameManager — apply pending blinds on reset', () => {
  beforeEach(() => {
    SharedState.pendingBlinds.clear();
  });

  it('applies queued delta on resetHand and clears pending', () => {
    const gm = new GameManager({ /* fixture; adapt to actual constructor */ });
    gm.tableId = 't1';
    gm.smallBlind = 10;
    gm.bigBlind = 20;
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: Date.now() });
    gm.resetHand();
    expect(gm.smallBlind).toBe(25);
    expect(gm.bigBlind).toBe(50);
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('does not change blinds when no pending entry', () => {
    const gm = new GameManager({ /* fixture */ });
    gm.tableId = 't1';
    gm.smallBlind = 10;
    gm.bigBlind = 20;
    gm.resetHand();
    expect(gm.smallBlind).toBe(10);
    expect(gm.bigBlind).toBe(20);
  });

  it('discards pending if older than 1 hour (stale guard)', () => {
    const gm = new GameManager({ /* fixture */ });
    gm.tableId = 't1';
    gm.smallBlind = 10;
    gm.bigBlind = 20;
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: Date.now() - 60 * 60 * 1000 - 1 });
    gm.resetHand();
    expect(gm.smallBlind).toBe(10); // unchanged — pending was stale
    expect(SharedState.pendingBlinds.has('t1')).toBe(false); // cleared
  });
});
```

The exact constructor + reset signatures depend on the actual `GameManager` API — read the file first and adapt the fixture setup. The behavioral assertion (apply on reset, clear afterwards, stale guard) is the spec.

- [ ] **Step 6.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 6.3: Hook into resetHand**

Edit `server/game/GameManager.js`. In the `resetHand()` method (or equivalent — the method called between hands when phase transitions to `'waiting'`), add at the top:

```js
const SharedState = require('../state/SharedState.js');
const PENDING_BLINDS_TTL_MS = 60 * 60 * 1000; // 1 hour

resetHand() {
  // Apply queued blind delta if present and fresh
  const pending = SharedState.pendingBlinds.get(this.tableId);
  if (pending) {
    const age = Date.now() - pending.queuedAt;
    if (age <= PENDING_BLINDS_TTL_MS) {
      this.smallBlind = pending.sb;
      this.bigBlind = pending.bb;
    }
    SharedState.pendingBlinds.delete(this.tableId);
  }
  // ...existing reset logic
}
```

(Adapt the property names — `smallBlind`/`bigBlind` may be different in this codebase.)

- [ ] **Step 6.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add server/game/GameManager.js \
        server/tests/GameManager.pendingBlinds.test.js
git commit -m "$(cat <<'EOF'
feat(game): consume pendingBlinds on hand reset

GameManager.resetHand applies any queued {sb, bb} delta from
SharedState.pendingBlinds and clears the entry. Stale entries
(>1 hour old) are discarded without applying. Spec 4.3, 5.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Surface `pending_blinds` on public `gameState`

**Files:**
- Modify: `server/game/GameManager.js` (or wherever `getPublicState()` lives)
- Test: extend `server/tests/GameManager.pendingBlinds.test.js`

- [ ] **Step 7.1: Failing test**

Append to the test file:

```js
describe('GameManager.getPublicState — pending_blinds', () => {
  it('includes pending_blinds when queued', () => {
    const gm = new GameManager({ /* fixture */ });
    gm.tableId = 't1';
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const state = gm.getPublicState();
    expect(state.pending_blinds).toMatchObject({ sb: 25, bb: 50 });
  });

  it('pending_blinds is null when nothing queued', () => {
    const gm = new GameManager({ /* fixture */ });
    gm.tableId = 't1';
    const state = gm.getPublicState();
    expect(state.pending_blinds).toBeNull();
  });
});
```

- [ ] **Step 7.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 7.3: Add to public state**

Edit `getPublicState()` in `GameManager.js`:

```js
getPublicState() {
  // ...existing fields
  const pending = SharedState.pendingBlinds.get(this.tableId);
  return {
    // ...existing
    pending_blinds: pending ? { sb: pending.sb, bb: pending.bb, queuedAt: pending.queuedAt } : null,
  };
}
```

(Don't expose `queuedBy` to the public state — it's coach internal info. The banner only needs sb/bb/queuedAt for display.)

- [ ] **Step 7.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add server/game/GameManager.js \
        server/tests/GameManager.pendingBlinds.test.js
git commit -m "$(cat <<'EOF'
feat(game): expose pending_blinds on public gameState

Adapter consumers (sidebar-v3 PendingBlindsBanner) need to render the
queued delta. Public state shows {sb, bb, queuedAt} only, not the
internal queuedBy stableId.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `tableCleanup` clears locks and pending entries

**Files:**
- Modify: `server/lifecycle/tableCleanup.js`
- Test: `server/tests/tableCleanup.coachState.test.js`

- [ ] **Step 8.1: Failing test**

Create `server/tests/tableCleanup.coachState.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');
const SharedState = require('../state/SharedState.js');
const tableCleanup = require('../lifecycle/tableCleanup.js');

beforeEach(() => {
  SharedState.activeCoachLocks.clear();
  SharedState.pendingBlinds.clear();
});

describe('tableCleanup — coach state', () => {
  it('clears coach lock when table closes', async () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    await tableCleanup.cleanupTable('t1');
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });

  it('clears pending blinds when table closes', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    await tableCleanup.cleanupTable('t1');
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });
});
```

- [ ] **Step 8.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 8.3: Add cleanups**

Edit `server/lifecycle/tableCleanup.js`. In the `cleanupTable(tableId)` function (or equivalent), add:

```js
SharedState.activeCoachLocks.delete(tableId);
SharedState.pendingBlinds.delete(tableId);
```

- [ ] **Step 8.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add server/lifecycle/tableCleanup.js \
        server/tests/tableCleanup.coachState.test.js
git commit -m "$(cat <<'EOF'
chore(lifecycle): clean coach lock and pending blinds on table close

Prevents stale entries when a table is removed from active state.
Spec 6.5 lifecycle.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Adapter surfaces `pending_blinds`

**Files:**
- Modify: `client/src/components/sidebar-v3/buildLiveData.js`
- Modify: `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`

- [ ] **Step 9.1: Failing test**

Append to `buildLiveData.test.js`:

```jsx
describe('buildLiveData — pending_blinds', () => {
  it('passes through gameState.pending_blinds', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], pending_blinds: { sb: 25, bb: 50, queuedAt: 100 } },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.pending_blinds).toMatchObject({ sb: 25, bb: 50 });
  });

  it('returns null when no pending', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], pending_blinds: null },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.pending_blinds).toBeNull();
  });
});
```

- [ ] **Step 9.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 9.3: Surface field**

Edit `buildLiveData.js`. Add to the returned object:

```js
return {
  ...fallback,
  status,
  actions_log,
  pending_blinds: hookState.gameState?.pending_blinds ?? null,
  // ...rest
};
```

- [ ] **Step 9.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add client/src/components/sidebar-v3/buildLiveData.js \
        client/src/components/sidebar-v3/__tests__/buildLiveData.test.js
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): surface pending_blinds in adapter

Passes through gameState.pending_blinds for PendingBlindsBanner.
Spec 7.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `PendingBlindsBanner` component

**Files:**
- Create: `client/src/components/sidebar-v3/PendingBlindsBanner.jsx`
- Test: `client/src/components/sidebar-v3/__tests__/PendingBlindsBanner.test.jsx`

- [ ] **Step 10.1: Failing test**

Create `__tests__/PendingBlindsBanner.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingBlindsBanner from '../PendingBlindsBanner.jsx';

describe('PendingBlindsBanner', () => {
  it('renders queued blind values + relative time', () => {
    const pending = { sb: 25, bb: 50, queuedAt: Date.now() - 5000 };
    render(<PendingBlindsBanner pending={pending} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={vi.fn()} />);
    expect(screen.getByText(/10\/20\s*→\s*25\/50/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Discard Pending/ })).toBeInTheDocument();
  });

  it('renders nothing when pending is null', () => {
    const { container } = render(<PendingBlindsBanner pending={null} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('clicking Discard Pending calls onDiscard', () => {
    const pending = { sb: 25, bb: 50, queuedAt: Date.now() };
    const onDiscard = vi.fn();
    render(<PendingBlindsBanner pending={pending} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole('button', { name: /Discard Pending/ }));
    expect(onDiscard).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 10.3: Implement component**

Create `client/src/components/sidebar-v3/PendingBlindsBanner.jsx`:

```jsx
import React from 'react';

export default function PendingBlindsBanner({ pending, liveBlinds, onDiscard }) {
  if (!pending) return null;
  const { sb, bb, queuedAt } = pending;
  return (
    <div
      role="status"
      style={{
        background: 'var(--accent-hot-faint, rgba(240,208,96,0.1))',
        border: '1px solid var(--accent-hot, #f0d060)',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ flex: 1, fontSize: 11, lineHeight: 1.4 }}>
        Blinds change queued: <b>{liveBlinds.sb}/{liveBlinds.bb} → {sb}/{bb}</b> (applies at next hand)
      </span>
      <button className="btn ghost sm" onClick={onDiscard}>Discard Pending</button>
    </div>
  );
}
```

- [ ] **Step 10.4: Run, verify pass**

Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add client/src/components/sidebar-v3/PendingBlindsBanner.jsx \
        client/src/components/sidebar-v3/__tests__/PendingBlindsBanner.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): PendingBlindsBanner component

Renders the queued blinds delta with a Discard Pending action. Hidden
when nothing pending. Spec 4.5, 5.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: BlindsSection routes Apply Now vs Apply at Next Hand

**Files:**
- Modify: `client/src/components/sidebar-v3/TabSetup.jsx` (BlindsSection)
- Modify: `client/src/hooks/useGameState.js` (add `applyBlindsAtNextHand`, `discardPendingBlinds` emit helpers)
- Test: extend `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx`

- [ ] **Step 11.1: Failing test**

Append to `TabSetup.test.jsx`:

```jsx
describe('TabSetup — Blinds Apply Now vs Apply at Next Hand', () => {
  it('phase=waiting renders Apply Now and emits setBlindLevels', () => {
    const emit = makeEmit();
    const data = { ...makeData({ bb: 20 }), gameState: { phase: 'waiting', paused: false, hand_id: null }, pending_blinds: null };
    render(<TabSetup data={data} emit={emit} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply 25\/50/i }));
    expect(emit.setBlindLevels).toHaveBeenCalledWith(25, 50);
  });

  it('phase!=waiting renders Apply at Next Hand and emits applyBlindsAtNextHand', () => {
    const emit = makeEmit({ applyBlindsAtNextHand: vi.fn() });
    const data = { ...makeData({ bb: 20 }), gameState: { phase: 'flop', paused: false, hand_id: 'h1' }, pending_blinds: null };
    render(<TabSetup data={data} emit={emit} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply at Next Hand/i }));
    expect(emit.applyBlindsAtNextHand).toHaveBeenCalledWith(25, 50);
  });

  it('renders PendingBlindsBanner when pending_blinds present', () => {
    const data = {
      ...makeData({ bb: 20 }),
      gameState: { phase: 'flop', paused: false, hand_id: 'h1' },
      pending_blinds: { sb: 25, bb: 50, queuedAt: Date.now() },
    };
    render(<TabSetup data={data} emit={makeEmit()} />);
    expect(screen.getByText(/Discard Pending/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 11.3: Update BlindsSection**

Edit `client/src/components/sidebar-v3/TabSetup.jsx`. In `BlindsSection`, conditionally route:

```jsx
import PendingBlindsBanner from './PendingBlindsBanner.jsx';

function BlindsSection({ data, emit }) {
  const liveBb = data.blindLevels.current.bb;
  const liveSb = data.blindLevels.current.sb;
  const phase = data.gameState?.phase;
  const isWaiting = phase === 'waiting';
  const pending = data.pending_blinds;
  // ...existing useState + derived state

  function applyBlinds() {
    if (!valid || !dirty) return;
    if (isWaiting && emit?.setBlindLevels) {
      emit.setBlindLevels(sb, bb);
    } else if (!isWaiting && emit?.applyBlindsAtNextHand) {
      emit.applyBlindsAtNextHand(sb, bb);
    }
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
  }

  function discardPending() {
    emit?.discardPendingBlinds?.();
  }

  return (
    <>
      <PendingBlindsBanner
        pending={pending}
        liveBlinds={{ sb: liveSb, bb: liveBb }}
        onDiscard={discardPending}
      />
      <div className="card">
        {/* ...existing card content with BB input */}
        <button
          className="btn primary full"
          onClick={applyBlinds}
          disabled={!dirty || !valid}
        >
          {applied ? '✓ Applied' : isWaiting ? `Apply ${sb}/${bb}` : `Apply at Next Hand →`}
        </button>
      </div>
      {/* ...presets section unchanged */}
    </>
  );
}
```

- [ ] **Step 11.4: Add emit helpers in useGameState**

Edit `client/src/hooks/useGameState.js`. Add two emit helpers:

```js
applyBlindsAtNextHand: (sb, bb) => socket.emit('coach:apply_blinds_at_next_hand', { tableId, sb, bb }),
discardPendingBlinds: () => socket.emit('coach:discard_pending_blinds', { tableId }),
```

(Adapt to wherever the existing emit helpers live and how `socket` and `tableId` are accessed in scope.)

- [ ] **Step 11.5: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: green.

- [ ] **Step 11.6: Commit**

```bash
git add client/src/components/sidebar-v3/TabSetup.jsx \
        client/src/hooks/useGameState.js \
        client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): wire BlindsSection Apply Now / Apply at Next Hand

Phase=waiting → Apply Now path (existing setBlindLevels). Phase!=waiting
→ Apply at Next Hand path (new applyBlindsAtNextHand emit). Renders
PendingBlindsBanner above the card when a delta is queued. Spec 5.5,
4.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final regression sweep + manual walkthrough

- [ ] **Step 12.1: Run full server test suite**

Run: `cd server && npx jest`
Expected: green. New tests: SharedState (2), coachLock (6), pendingBlinds (7), GameManager.pendingBlinds (5), tableCleanup.coachState (2). ~22 new tests.

- [ ] **Step 12.2: Run full client test suite**

Run: `cd client && npx vitest run`
Expected: green.

- [ ] **Step 12.3: Build client**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 12.4: Manual staging walkthrough**

After deploy, verify on staging:

1. Coach A logs in, opens a coached_cash table → sidebar shows full coach controls.
2. Coach B logs in, opens the same table → sidebar shows observer mode (no coach footer actions); toast appears: "Another coach is currently active...".
3. Coach A closes browser tab → Coach B refreshes → claims the lock.
4. Coach A opens 2 tabs of the same table → both show coach controls (multi-tab fine).
5. Mid-hand on coach A: Setup → Blinds → change BB to 100 → button reads "Apply at Next Hand →" → click → banner appears with "Blinds change queued: 25/50 → 50/100".
6. Coach B (observer) reloads → also sees the pending banner.
7. Coach A: Discard Pending → banner disappears for both.
8. Coach A: re-queue 100 BB → finish hand → next hand auto-deals with 50/100 blinds → banner is gone.
9. Restart server → verify pending blinds wiped (no surprise stale apply).

- [ ] **Step 12.5: Investigate and fix any regression**

Standard fix cycle: failing test → fix → re-test → commit.

---

## Self-Review Checklist

- [ ] Spec coverage for all Phase C items in section 10:
  - Single-coach lock in joinRoom + disconnect → Tasks 2, 3 ✓
  - Pending blinds Map + 2 socket events → Tasks 4, 5 ✓
  - GameManager hand-reset hook → Task 6 ✓
  - Public state surfacing → Task 7 ✓
  - Cleanup on table close → Task 8 ✓
  - Adapter field → Task 9 ✓
  - Banner component → Task 10 ✓
  - BlindsSection routing → Task 11 ✓
- [ ] No placeholders, TODOs, or "TBD".
- [ ] Type consistency: `pending_blinds` shape, `activeCoachLocks` keys, emit helper names match across all tasks.
- [ ] Server tests: in-memory state cleared in `beforeEach` for isolation.

**End of Phase C plan.**
