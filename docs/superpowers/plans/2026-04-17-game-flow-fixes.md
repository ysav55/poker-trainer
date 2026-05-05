# Game Flow Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 game flow issues from live test: mid-hand join, zero-chip handling, tournament table assignment.

**Architecture:** TDD approach (test first), frequent small commits. Build order: A → F → C (can parallelize F/C). Each issue is independent after A.

**Tech Stack:** Node.js/Express, Socket.io, Supabase/Postgres, React, existing GameManager state machine.

---

## File Structure Overview

**Issue A (Mid-Hand Join):**
- Modify: `server/socket/handlers/joinRoom.js` (lines ~265, ~310)
- Modify: `server/game/GameManager.js` (_finishHand method, ~line 800)
- No new files

**Issue C (Zero-Chip):**
- Modify: `server/game/GameManager.js` (startGame, ~line 454)
- Modify: `server/game/positions.js` (buildPositionMap, ~line 51)
- Create: `server/socket/handlers/rebuy.js` (new handler, ~50 lines)
- Modify: `server/lifecycle/idleTimer.js` (add table check, ~30 lines new)

**Issue F (Tournament):**
- Create: `supabase/migrations/025_tournament_table_assignment.sql` (~10 lines)
- Modify: `server/db/repositories/TournamentRepository.js` (add 4 methods, ~100 lines)
- Modify: `server/routes/tournaments.js` (registration flow, ~20 lines)
- Modify: `server/socket/handlers/joinRoom.js` (tournament guard, ~15 lines)
- Modify: `server/game/TournamentController.js` (end-of-level-1 no-show bust, ~15 lines)
- Modify: `client/src/pages/TournamentLobby.jsx` (UI, ~20 lines)

**Test files:**
- Create: `server/game/__tests__/gameFlowFixes.test.js` (comprehensive unit tests)
- Modify: `server/socket/__tests__/integration.test.js` (socket integration tests)
- Modify: `server/game/__tests__/GameManager.test.js` (add 0-chip scenarios)

---

## Task Breakdown

### Issue A: Mid-Hand Join

#### Task 1: Test—Mid-hand join marks player as spectator

**Files:**
- Create: `server/game/__tests__/gameFlowFixes.test.js`

**Code:**

```javascript
// server/game/__tests__/gameFlowFixes.test.js

const GameManager = require('../GameManager');
const { createMockGame, createMockPlayer } = require('../__tests__/testHelpers');

describe('Issue A: Mid-Hand Join Spectator Flow', () => {
  
  test('Player joining mid-hand should be marked as spectator', () => {
    const gm = createMockGame({ phase: 'betting' }); // Hand in progress
    const player = createMockPlayer({ id: 'new-player', name: 'Alice' });
    
    // Simulate join during hand
    gm.addPlayer(player.id, player.name, false, null);
    
    // Check: player is seated but NOT in hand
    const seated = gm.state.players[player.id];
    expect(seated).toBeDefined();
    expect(seated.is_seated).toBe(true);
    expect(seated.in_hand).toBe(false); // CRITICAL: should be false mid-hand
  });

});
```

- [ ] **Step 1: Create test file with failing test**

```bash
cd c:\Users\user\poker-trainer
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="mid-hand"
```

Expected: `FAIL` — `expected false but got true` (or `in_hand` undefined)

#### Task 2: Implement—Add phase check in joinRoom.js

**Files:**
- Modify: `server/socket/handlers/joinRoom.js` (line ~265)

**Current code (line ~265):**
```javascript
gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);
```

**Change to:**
```javascript
gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);

// If hand is active, mark player as spectator for this hand
if (gm.state.phase !== 'waiting') {
  gm.setPlayerInHand(socket.id, false);
}
```

- [ ] **Step 1: Locate joinRoom.js and find addPlayer call**

Line reference: `server/socket/handlers/joinRoom.js:265`

- [ ] **Step 2: Add phase check after addPlayer**

Insert the 3-line check shown above after the `gm.addPlayer()` call.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="mid-hand"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/socket/handlers/joinRoom.js server/game/__tests__/gameFlowFixes.test.js
git commit -m "feat: mid-hand joiner marked as spectator (phase check in joinRoom)"
```

---

#### Task 3: Test—Hand finish auto-rejoins spectators

**Files:**
- Modify: `server/game/__tests__/gameFlowFixes.test.js`

**Add test:**

```javascript
test('_finishHand() auto-rejoins sitting-out players with chips', () => {
  const gm = createMockGame({ phase: 'showdown' });
  
  // Add player who was sitting out
  gm.addPlayer('p1', 'Bob', false, null);
  gm.setPlayerInHand('p1', false); // Sitting out
  
  // Manually set player stack > 0
  gm.state.players['p1'].stack = 100;
  
  // Finish hand
  gm._finishHand(); // Internally calls rejoin logic
  
  // Check: player is back in next hand
  expect(gm.state.players['p1'].in_hand).toBe(true);
});
```

- [ ] **Step 1: Add test to gameFlowFixes.test.js**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="auto-rejoins"
```

Expected: `FAIL` — `expected true but got false`

#### Task 4: Implement—Add rejoin loop in GameManager._finishHand()

**Files:**
- Modify: `server/game/GameManager.js` (line ~800, in `_finishHand()` method)

**Find the _finishHand method. Near the end (after showdown resolution), add:**

```javascript
// Auto-rejoin spectators for next hand
for (const player of Object.values(this.state.players)) {
  if (player.is_seated && !player.in_hand && player.stack > 0) {
    this.setPlayerInHand(player.id, true);
  }
}
```

**Location context:** This should go AFTER `this._resolveShowdown()` completes, before `this.state.phase = 'waiting'` for next hand.

- [ ] **Step 1: Locate _finishHand() in GameManager.js**

- [ ] **Step 2: Find where showdown is resolved and add rejoin loop**

Insert the loop shown above after showdown logic.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="auto-rejoins"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/game/GameManager.js
git commit -m "feat: auto-rejoin sitting-out players at hand finish"
```

---

#### Task 5: Test—Socket broadcasts is_spectating flag

**Files:**
- Modify: `server/socket/__tests__/integration.test.js` (or create new test)

**Add test:**

```javascript
test('player:joined event includes is_spectating flag when hand in progress', async () => {
  const socket = io(SERVER_URL);
  const game = getActiveGame(); // Mock game in 'betting' phase
  
  socket.emit('join_room', { tableId: game.tableId, playerName: 'Charlie' });
  
  let joinEvent;
  socket.on('player:joined', (data) => { joinEvent = data; });
  
  await wait(100);
  
  expect(joinEvent).toBeDefined();
  expect(joinEvent.is_spectating).toBe(true); // Should be present
});
```

- [ ] **Step 1: Add test to socket integration test file**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="is_spectating"
```

Expected: `FAIL` — `is_spectating is undefined`

#### Task 6: Implement—Broadcast is_spectating in joinRoom.js

**Files:**
- Modify: `server/socket/handlers/joinRoom.js` (line ~310, where `player:joined` is emitted)

**Find the emit for `player:joined`. Update it to include `is_spectating`:**

**Current (approx):**
```javascript
io.to(tableId).emit('player:joined', {
  playerId: socket.id,
  name: trimmedName,
  stack: player.stack
});
```

**Change to:**
```javascript
io.to(tableId).emit('player:joined', {
  playerId: socket.id,
  name: trimmedName,
  stack: player.stack,
  is_spectating: gm.state.phase !== 'waiting' // ADD THIS LINE
});
```

- [ ] **Step 1: Locate player:joined emit in joinRoom.js**

Line reference: search for `io.to(tableId).emit('player:joined'`

- [ ] **Step 2: Add is_spectating field**

Add line shown above to the emit payload.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="is_spectating"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/socket/handlers/joinRoom.js
git commit -m "feat: broadcast is_spectating flag on player:joined event"
```

---

### Issue C: Zero-Chip Handling

#### Task 7: Test—startGame auto-sits broke players

**Files:**
- Modify: `server/game/__tests__/gameFlowFixes.test.js`

**Add test:**

```javascript
test('startGame() auto-sits broke players instead of blocking', () => {
  const gm = createMockGame({
    players: {
      'p1': { id: 'p1', name: 'Alice', stack: 100, is_seated: true },
      'p2': { id: 'p2', name: 'Bob', stack: 0, is_seated: true }, // BROKE
      'p3': { id: 'p3', name: 'Charlie', stack: 50, is_seated: true }
    }
  });
  
  const result = gm.startGame();
  
  // Should succeed (not blocked)
  expect(result.success).toBe(true);
  
  // Bob should be sitting out
  expect(gm.state.players['p2'].in_hand).toBe(false);
  
  // Alice and Charlie should be in hand
  expect(gm.state.players['p1'].in_hand).toBe(true);
  expect(gm.state.players['p3'].in_hand).toBe(true);
});
```

- [ ] **Step 1: Add test to gameFlowFixes.test.js**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="auto-sits broke"
```

Expected: `FAIL` — Game start returns error or broke player is in hand

#### Task 8: Implement—Auto-sit broke players in startGame()

**Files:**
- Modify: `server/game/GameManager.js` (line ~454, in `startGame()` method)

**Find startGame(). Current code (approx line 454):**

```javascript
const brokePlayers = seated.filter(p => p.stack === 0);
if (brokePlayers.length > 0) {
  return { success: false, message: `Cannot start: ${brokePlayers.map(p => p.name).join(', ')} have 0 chips` };
}
```

**Replace with:**

```javascript
// Auto-sit-out broke players
for (const player of seated.filter(p => p.stack === 0)) {
  this.setPlayerInHand(player.id, false);
}

// Validate minimum active players
const activePlayers = seated.filter(p => p.stack > 0);
if (activePlayers.length < 2) {
  return { success: false, message: 'Need at least 2 active players to start' };
}
```

- [ ] **Step 1: Locate startGame() method in GameManager.js**

- [ ] **Step 2: Replace the broke check with auto-sit logic**

Replace lines 454–458 with the code shown above.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="auto-sits broke"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/game/GameManager.js
git commit -m "fix: auto-sit broke players instead of blocking game start"
```

---

#### Task 9: Test—buildPositionMap filters 0-chip players

**Files:**
- Modify: `server/game/__tests__/gameFlowFixes.test.js`

**Add test:**

```javascript
test('buildPositionMap() skips 0-chip players (no seat assignment)', () => {
  const { buildPositionMap } = require('../positions');
  
  const players = {
    'p1': { id: 'p1', is_seated: true, stack: 100 },
    'p2': { id: 'p2', is_seated: true, stack: 0 },   // BROKE
    'p3': { id: 'p3', is_seated: true, stack: 50 }
  };
  
  const positionMap = buildPositionMap(players, 0); // dealerSeat: 0 (p1)
  
  // Should have p1 and p3, but NOT p2
  expect(Object.keys(positionMap).length).toBe(2);
  expect(positionMap['p1']).toBeDefined();
  expect(positionMap['p2']).toBeUndefined(); // BROKE player not in map
  expect(positionMap['p3']).toBeDefined();
});
```

- [ ] **Step 1: Add test to gameFlowFixes.test.js**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="buildPositionMap.*skips"
```

Expected: `FAIL` — Position map includes p2

#### Task 10: Implement—Filter 0-chip in buildPositionMap()

**Files:**
- Modify: `server/game/positions.js` (line ~51)

**Find buildPositionMap(). Current line ~51:**

```javascript
const seated = Object.values(players).filter(p => p.is_seated);
```

**Change to:**

```javascript
const seated = Object.values(players).filter(p => p.is_seated && p.stack > 0);
```

- [ ] **Step 1: Locate buildPositionMap() in positions.js**

- [ ] **Step 2: Update filter on line ~51**

Add `&& p.stack > 0` to the filter.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="buildPositionMap.*skips"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/game/positions.js
git commit -m "fix: exclude 0-chip players from position mapping"
```

---

#### Task 11: Create—Rebuy socket handler file

**Files:**
- Create: `server/socket/handlers/rebuy.js`

**Code:**

```javascript
// server/socket/handlers/rebuy.js

const { ChipBankRepository } = require('../../db');
const logger = require('../../lib/logger');

function registerRebuyHandler(io, gm) {
  const socket = io.sockets;
  
  socket.on('connection', (client) => {
    client.on('table:player_rebuy', async (data) => {
      try {
        const { playerId, tableId, amount } = data;
        const player = gm.state.players?.[playerId];
        
        // Validate: player is seated, at 0 chips, in auto-cash mode
        if (!player || player.stack !== 0 || !player.is_seated) {
          return client.emit('error:rebuy', { message: 'Invalid rebuy state' });
        }
        
        // Only allow in auto-cash (uncoached) mode
        if (gm.mode !== 'uncoached_cash') {
          return client.emit('error:rebuy', { message: 'Rebuy only in auto-cash mode' });
        }
        
        // Only allow during sitting-out hand (phase === 'waiting')
        if (gm.state.phase !== 'waiting') {
          return client.emit('error:rebuy', { message: 'Can only rebuy between hands' });
        }
        
        // Check chip bank balance
        const chipBank = await ChipBankRepository.getBalance(playerId);
        if (chipBank.balance < amount) {
          return client.emit('error:rebuy', { message: 'Insufficient chip bank balance' });
        }
        
        // Deduct from chip bank
        await ChipBankRepository.adjustBalance(playerId, -amount);
        
        // Update game stack
        gm.updatePlayerStack(playerId, amount);
        gm.setPlayerInHand(playerId, true);
        
        // Broadcast to table
        io.to(tableId).emit('player:rebuyed', {
          playerId,
          newStack: gm.state.players[playerId].stack,
          name: player.name
        });
        
        logger.info(`Player ${playerId} rebuyed $${amount}`);
      } catch (error) {
        logger.error('Rebuy handler error:', error);
        client.emit('error:rebuy', { message: 'Rebuy failed' });
      }
    });
  });
}

module.exports = { registerRebuyHandler };
```

- [ ] **Step 1: Create rebuy.js in server/socket/handlers/**

Copy code shown above into new file.

- [ ] **Step 2: Verify imports resolve**

Check that `ChipBankRepository` is exported from `server/db/index.js`. If not, add it.

```bash
grep -n "ChipBankRepository" server/db/index.js
```

If not found, add: `module.exports = { ..., ChipBankRepository }`

#### Task 12: Test—Rebuy deducts from chip bank

**Files:**
- Modify: `server/socket/__tests__/integration.test.js`

**Add test:**

```javascript
test('table:player_rebuy deducts from chip bank and updates game stack', async () => {
  const socket = io(SERVER_URL);
  const gm = getActiveGame({ phase: 'waiting' });
  const playerId = 'test-player';
  
  // Setup: player at 0 chips, 500 in chip bank
  gm.state.players[playerId] = { id: playerId, stack: 0, is_seated: true };
  await ChipBankRepository.setBalance(playerId, 500);
  
  // Emit rebuy
  socket.emit('table:player_rebuy', {
    playerId,
    tableId: gm.tableId,
    amount: 100
  });
  
  await wait(100);
  
  // Check: chip bank deducted, game stack updated
  const chipBank = await ChipBankRepository.getBalance(playerId);
  expect(chipBank.balance).toBe(400); // 500 - 100
  expect(gm.state.players[playerId].stack).toBe(100);
  expect(gm.state.players[playerId].in_hand).toBe(true);
});
```

- [ ] **Step 1: Add test to integration test file**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="rebuy deducts"
```

Expected: `FAIL` — Handler not registered yet

#### Task 13: Implement—Register rebuy handler in socket index

**Files:**
- Modify: `server/socket/index.js` (top-level socket handler registration)

**Find where other handlers are registered. Add:**

```javascript
const { registerRebuyHandler } = require('./handlers/rebuy');

// ... in the setup function or at top-level:
registerRebuyHandler(io, gm);
```

- [ ] **Step 1: Locate socket/index.js**

- [ ] **Step 2: Import registerRebuyHandler at top**

Add import line shown above (with other imports).

- [ ] **Step 3: Register handler in initialization**

Find where other handlers are registered (likely in a function that takes `io` and `gm`). Add the `registerRebuyHandler()` call.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="rebuy deducts"
```

Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add server/socket/handlers/rebuy.js server/socket/index.js
git commit -m "feat: add rebuy socket handler with chip bank integration"
```

---

#### Task 14: Test—Idle timeout detects 0-chip idle players

**Files:**
- Modify: `server/lifecycle/__tests__/idleTimer.test.js` (or create if not exists)

**Add test:**

```javascript
test('tableIdleCheck() removes 0-chip idle players after 5 min', () => {
  const { checkTableIdle } = require('../idleTimer');
  
  const table = {
    tableMode: 'uncoached_cash',
    lastActionAt: Date.now() - (6 * 60 * 1000), // 6 min ago
    players: {
      'p1': { id: 'p1', stack: 100, is_seated: true, is_active: true },
      'p2': { id: 'p2', stack: 0, is_seated: true, is_active: false }, // BROKE & IDLE
      'p3': { id: 'p3', stack: 50, is_seated: true, is_active: true }
    },
    removePlayer: jest.fn()
  };
  
  checkTableIdle('table-1', table);
  
  // p2 should be removed
  expect(table.removePlayer).toHaveBeenCalledWith('p2');
  expect(table.removePlayer).not.toHaveBeenCalledWith('p1');
  expect(table.removePlayer).not.toHaveBeenCalledWith('p3');
});

test('tableIdleCheck() skips coached mode (no auto-kick)', () => {
  const { checkTableIdle } = require('../idleTimer');
  
  const table = {
    tableMode: 'coached_cash', // COACHED - should be skipped
    lastActionAt: Date.now() - (6 * 60 * 1000),
    players: { 'p1': { stack: 0, is_seated: true } },
    removePlayer: jest.fn()
  };
  
  checkTableIdle('table-1', table);
  
  // Should NOT remove anyone in coached mode
  expect(table.removePlayer).not.toHaveBeenCalled();
});
```

- [ ] **Step 1: Add tests to idleTimer test file**

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- server/lifecycle/__tests__/idleTimer.test.js --testNamePattern="Idle.*idle"
```

Expected: `FAIL` — `checkTableIdle` not exported or doesn't have the logic

#### Task 15: Implement—Add table idle check in idleTimer.js

**Files:**
- Modify: `server/lifecycle/idleTimer.js`

**Add function:**

```javascript
const TABLE_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function checkTableIdle(tableId, table, io) {
  // Skip coached mode (study time, no auto-kick)
  if (table.tableMode === 'coached_cash') return;
  
  // Check if any action in last 5 min
  const lastAction = table.lastActionAt || table.createdAt;
  if (Date.now() - lastAction > TABLE_IDLE_TIMEOUT_MS) {
    // Find 0-chip idle players
    const toRemove = Object.values(table.players || {}).filter(
      p => p.stack === 0 && p.is_seated && !p.is_active
    );
    
    // Remove each
    for (const player of toRemove) {
      table.removePlayer(player.id);
      
      // Broadcast kick event
      if (io) {
        io.to(tableId).emit('player:kicked_idle', {
          playerId: player.id,
          name: player.name
        });
      }
    }
  }
}

module.exports = { checkTableIdle, ... }; // Export alongside existing exports
```

**Also add a call to this function in the main idle timer loop (likely around line 50+):**

```javascript
// In existing idle check loop:
for (const [tableId, table] of SharedState.tables) {
  checkTableIdle(tableId, table, io);
}
```

- [ ] **Step 1: Locate idleTimer.js**

- [ ] **Step 2: Add checkTableIdle function shown above**

- [ ] **Step 3: Add call in idle check loop**

Find where idle checking happens (likely iterates SharedState.tables). Add the `checkTableIdle()` call.

- [ ] **Step 4: Export checkTableIdle**

Add to module.exports at bottom of file.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- server/lifecycle/__tests__/idleTimer.test.js --testNamePattern="Idle.*idle"
```

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add server/lifecycle/idleTimer.js server/lifecycle/__tests__/idleTimer.test.js
git commit -m "feat: auto-kick 0-chip idle players after 5 min (auto-cash only)"
```

---

#### Task 16: Test—_finishHand doesn't rejoin 0-chip

**Files:**
- Modify: `server/game/__tests__/gameFlowFixes.test.js`

**Add test:**

```javascript
test('_finishHand() does NOT rejoin sitting-out 0-chip players', () => {
  const gm = createMockGame({ phase: 'showdown' });
  
  gm.addPlayer('p1', 'Alice', false, null);
  gm.setPlayerInHand('p1', false); // Sitting out
  gm.state.players['p1'].stack = 0; // BROKE
  
  gm._finishHand();
  
  // Player should stay out (not rejoined)
  expect(gm.state.players['p1'].in_hand).toBe(false);
});
```

- [ ] **Step 1: Add test to gameFlowFixes.test.js**

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test -- server/game/__tests__/gameFlowFixes.test.js --testNamePattern="NOT rejoin.*0-chip"
```

Expected: `PASS` (your rejoin logic already has the `player.stack > 0` guard from Task 4)

**If FAIL**, verify your Task 4 implementation includes the `player.stack > 0` check.

- [ ] **Step 3: No implementation needed**

This test validates existing logic from Task 4.

---

### Issue F: Tournament Table Assignment

#### Task 17: Create—Migration for tournament table assignment

**Files:**
- Create: `supabase/migrations/025_tournament_table_assignment.sql`

**Code:**

```sql
-- Migration: Add table assignment to tournament registrations

ALTER TABLE tournament_registrations
ADD COLUMN assigned_table_id INT REFERENCES tournament_tables(id);

ALTER TABLE tournament_registrations
ADD COLUMN last_action_at TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_tournament_registrations_assigned_table
ON tournament_registrations(tournament_id, assigned_table_id);

CREATE INDEX idx_tournament_registrations_last_action
ON tournament_registrations(tournament_id, last_action_at);
```

- [ ] **Step 1: Create migration file**

Create file: `supabase/migrations/025_tournament_table_assignment.sql`

Paste code shown above.

- [ ] **Step 2: Verify migration numbering**

Check the latest migration number in supabase/migrations/. Make sure 025 is next in sequence.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/025_tournament_table_assignment.sql
git commit -m "migration: add assigned_table_id and last_action_at to tournament_registrations"
```

---

#### Task 18: Test—TournamentRepository.findLeastFullTable()

**Files:**
- Create: `server/db/repositories/__tests__/TournamentRepository.test.js` (or append if exists)

**Add test:**

```javascript
const TournamentRepository = require('../TournamentRepository');
const { supabase } = require('../../index');

describe('TournamentRepository', () => {
  
  test('findLeastFullTable() returns table with fewest registered players', async () => {
    // Setup: 3 tables, 2 registered at table 1, 1 at table 2, 0 at table 3
    const tournamentId = 'test-tournament-1';
    
    // Insert test data (tables with registrations)
    await supabase.from('tournament_tables').insert([
      { id: 1, tournament_id: tournamentId, table_number: 1 },
      { id: 2, tournament_id: tournamentId, table_number: 2 },
      { id: 3, tournament_id: tournamentId, table_number: 3 }
    ]);
    
    await supabase.from('tournament_registrations').insert([
      { player_id: 'p1', tournament_id: tournamentId, assigned_table_id: 1 },
      { player_id: 'p2', tournament_id: tournamentId, assigned_table_id: 1 },
      { player_id: 'p3', tournament_id: tournamentId, assigned_table_id: 2 }
    ]);
    
    const repo = new TournamentRepository(supabase);
    const leastFull = await repo.findLeastFullTable(tournamentId);
    
    // Should return table 3 (0 registered) or table 2 (1 registered)
    expect(leastFull.id).toBe(3);
  });
  
});
```

- [ ] **Step 1: Create test file or append to existing**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/db/repositories/__tests__/TournamentRepository.test.js --testNamePattern="findLeastFullTable"
```

Expected: `FAIL` — Method doesn't exist or query is wrong

#### Task 19: Implement—TournamentRepository.findLeastFullTable()

**Files:**
- Modify: `server/db/repositories/TournamentRepository.js`

**Add method:**

```javascript
async findLeastFullTable(tournamentId) {
  const { data, error } = await this.supabase
    .from('tournament_tables')
    .select(`
      id,
      table_number,
      capacity,
      tournament_registrations(id)
    `)
    .eq('tournament_id', tournamentId)
    .order('tournament_registrations.count()', { ascending: true })
    .limit(1);
  
  if (error) throw error;
  return data?.[0] || null;
}
```

**Alternative simpler query (if above doesn't work with Supabase):**

```javascript
async findLeastFullTable(tournamentId) {
  // Get all tables with their registration counts
  const { data: tables, error: tableError } = await this.supabase
    .from('tournament_tables')
    .select('id, table_number, capacity')
    .eq('tournament_id', tournamentId);
  
  if (tableError) throw tableError;
  
  // Count registrations per table
  const { data: registrations, error: regError } = await this.supabase
    .from('tournament_registrations')
    .select('assigned_table_id')
    .eq('tournament_id', tournamentId);
  
  if (regError) throw regError;
  
  // Find table with fewest registrations
  const countByTable = {};
  tables.forEach(t => countByTable[t.id] = 0);
  registrations.forEach(r => {
    if (r.assigned_table_id) countByTable[r.assigned_table_id]++;
  });
  
  let leastFull = tables[0];
  let minCount = countByTable[leastFull.id];
  
  for (const table of tables) {
    if (countByTable[table.id] < minCount) {
      leastFull = table;
      minCount = countByTable[table.id];
    }
  }
  
  return leastFull;
}
```

- [ ] **Step 1: Locate TournamentRepository.js**

- [ ] **Step 2: Add findLeastFullTable method**

Use the simpler alternative query if the first doesn't work with your Supabase schema.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/db/repositories/__tests__/TournamentRepository.test.js --testNamePattern="findLeastFullTable"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/db/repositories/TournamentRepository.js server/db/repositories/__tests__/TournamentRepository.test.js
git commit -m "feat: TournamentRepository.findLeastFullTable() for balanced seating"
```

---

#### Task 20: Test—addPlayerToTournament stores assigned_table_id

**Files:**
- Modify: `server/db/repositories/__tests__/TournamentRepository.test.js`

**Add test:**

```javascript
test('addPlayerToTournament() stores assigned_table_id', async () => {
  const repo = new TournamentRepository(supabase);
  const tournamentId = 'test-tournament-2';
  const playerId = 'player-test-1';
  const tableId = 42;
  
  const registration = await repo.addPlayerToTournament(playerId, tournamentId, {
    assigned_table_id: tableId
  });
  
  expect(registration.assigned_table_id).toBe(tableId);
  
  // Verify in DB
  const { data: stored } = await supabase
    .from('tournament_registrations')
    .select('assigned_table_id')
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .single();
  
  expect(stored.assigned_table_id).toBe(tableId);
});
```

- [ ] **Step 1: Add test to TournamentRepository.test.js**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/db/repositories/__tests__/TournamentRepository.test.js --testNamePattern="addPlayerToTournament.*assigned"
```

Expected: `FAIL` — Method doesn't handle assigned_table_id

#### Task 21: Implement—Update addPlayerToTournament to store assignment

**Files:**
- Modify: `server/db/repositories/TournamentRepository.js`

**Find addPlayerToTournament() method. Update to include assigned_table_id:**

**Current (approx):**
```javascript
async addPlayerToTournament(playerId, tournamentId, buyInAmount) {
  const { data, error } = await this.supabase
    .from('tournament_registrations')
    .insert({
      player_id: playerId,
      tournament_id: tournamentId,
      buy_in_amount: buyInAmount
    })
    .select();
  
  if (error) throw error;
  return data[0];
}
```

**Change to:**

```javascript
async addPlayerToTournament(playerId, tournamentId, options = {}) {
  const { assigned_table_id, buy_in_amount = 0 } = options;
  
  const { data, error } = await this.supabase
    .from('tournament_registrations')
    .insert({
      player_id: playerId,
      tournament_id: tournamentId,
      buy_in_amount,
      assigned_table_id,
      last_action_at: new Date().toISOString()
    })
    .select();
  
  if (error) throw error;
  return data[0];
}
```

- [ ] **Step 1: Locate addPlayerToTournament in TournamentRepository.js**

- [ ] **Step 2: Update signature and insert logic**

Change from positional `buyInAmount` parameter to `options` object. Add `assigned_table_id` and `last_action_at` to insert.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/db/repositories/__tests__/TournamentRepository.test.js --testNamePattern="addPlayerToTournament.*assigned"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/db/repositories/TournamentRepository.js
git commit -m "feat: addPlayerToTournament stores assigned_table_id and last_action_at"
```

---

#### Task 22: Add—TournamentRepository helper methods (verifyAssignedTable, markPlayerActive, bustMissingPlayers)

**Files:**
- Modify: `server/db/repositories/TournamentRepository.js`

**Add three methods:**

```javascript
async verifyAssignedTable(playerId, tournamentId, tableId) {
  // Check if player is assigned to this table
  const { data, error } = await this.supabase
    .from('tournament_registrations')
    .select('assigned_table_id')
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .single();
  
  if (error) throw error;
  return data?.assigned_table_id === tableId;
}

async markPlayerActive(playerId, tournamentId) {
  // Update last_action_at to mark player as connected
  const { error } = await this.supabase
    .from('tournament_registrations')
    .update({ last_action_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId);
  
  if (error) throw error;
}

async bustMissingPlayers(tournamentId, blindLevelDurationMs) {
  // At end of blind level 1: set stack = 0 for no-shows
  const levelEndTime = new Date(Date.now() - blindLevelDurationMs);
  
  // Get registrations without action in the window
  const { data: noShows, error: selectError } = await this.supabase
    .from('tournament_registrations')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .lt('last_action_at', levelEndTime.toISOString());
  
  if (selectError) throw selectError;
  
  if (noShows.length === 0) return;
  
  // Bust all no-show players
  const playerIds = noShows.map(r => r.player_id);
  const { error: bustError } = await this.supabase
    .from('tournament_players')
    .update({
      stack: 0,
      busted_at: new Date().toISOString(),
      busted_reason: 'no_show'
    })
    .in('player_id', playerIds)
    .eq('tournament_id', tournamentId);
  
  if (bustError) throw bustError;
  
  return noShows.length;
}
```

- [ ] **Step 1: Add three methods to TournamentRepository.js**

- [ ] **Step 2: Verify method structure**

Ensure all three are exported in module.exports or as class methods (depending on class structure).

- [ ] **Step 3: No unit tests required for these utility methods**

(They'll be tested in integration tests that call them)

- [ ] **Step 4: Commit**

```bash
git add server/db/repositories/TournamentRepository.js
git commit -m "feat: add verifyAssignedTable, markPlayerActive, bustMissingPlayers methods"
```

---

#### Task 23: Test—Registration flow assigns table

**Files:**
- Modify: `server/routes/__tests__/tournaments.test.js` (or create if not exists)

**Add test:**

```javascript
const request = require('supertest');
const app = require('../../index');
const TournamentRepository = require('../../db/repositories/TournamentRepository');

describe('POST /api/tournaments/:id/register', () => {
  
  test('assigns table at registration time', async () => {
    const tournamentId = 'test-tournament-3';
    const playerId = 'player-assign-1';
    
    // Setup: tournament with tables
    const repo = new TournamentRepository(supabase);
    await repo.createTournament({ id: tournamentId, name: 'Test' });
    await supabase.from('tournament_tables').insert([
      { tournament_id: tournamentId, table_number: 1 },
      { tournament_id: tournamentId, table_number: 2 }
    ]);
    
    // Register player
    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/register`)
      .set('Authorization', `Bearer ${getTestToken(playerId)}`)
      .send({ playerName: 'Alice', buyInAmount: 100 });
    
    expect(res.status).toBe(200);
    expect(res.body.assignedTableId).toBeDefined();
    expect([1, 2]).toContain(res.body.assignedTableNumber);
    
    // Verify in DB
    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('assigned_table_id')
      .eq('player_id', playerId)
      .eq('tournament_id', tournamentId)
      .single();
    
    expect(reg.assigned_table_id).toBeDefined();
  });
  
});
```

- [ ] **Step 1: Create or append to tournaments route test file**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/routes/__tests__/tournaments.test.js --testNamePattern="assigns table"
```

Expected: `FAIL` — Registration endpoint doesn't assign table

#### Task 24: Implement—Update tournament registration to assign table

**Files:**
- Modify: `server/routes/tournaments.js` (POST /api/tournaments/:id/register endpoint)

**Find the register endpoint. Current code (approx):**

```javascript
router.post('/:tournamentId/register', requireAuth, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const playerId = req.user.id;
    const { playerName, buyInAmount } = req.body;
    
    const repo = new TournamentRepository(supabase);
    const registration = await repo.addPlayerToTournament(
      playerId, 
      tournamentId, 
      buyInAmount
    );
    
    return res.json({ success: true, registration });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
```

**Change to:**

```javascript
router.post('/:tournamentId/register', requireAuth, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const playerId = req.user.id;
    const { playerName, buyInAmount } = req.body;
    
    const repo = new TournamentRepository(supabase);
    
    // Find least-full table for this tournament
    const availableTable = await repo.findLeastFullTable(tournamentId);
    if (!availableTable) {
      return res.status(400).json({ error: 'No tables available for tournament' });
    }
    
    // Register and assign table
    const registration = await repo.addPlayerToTournament(
      playerId, 
      tournamentId, 
      {
        buy_in_amount: buyInAmount,
        assigned_table_id: availableTable.id
      }
    );
    
    return res.json({
      success: true,
      registration,
      assignedTableId: availableTable.id,
      assignedTableNumber: availableTable.table_number
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
```

- [ ] **Step 1: Locate tournament register endpoint in routes/tournaments.js**

- [ ] **Step 2: Update to call findLeastFullTable and pass assigned_table_id**

Replace the endpoint code with the one shown above.

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- server/routes/__tests__/tournaments.test.js --testNamePattern="assigns table"
```

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add server/routes/tournaments.js
git commit -m "feat: assign table at tournament registration time"
```

---

#### Task 25: Test—Join guard rejects non-assigned table

**Files:**
- Modify: `server/socket/__tests__/integration.test.js`

**Add test:**

```javascript
test('tournament join rejects player joining non-assigned table', async () => {
  const socket = io(SERVER_URL);
  const tournament = getActiveTournament();
  const player = tournament.players[0];
  const assignedTableId = player.assigned_table_id; // e.g., 1
  const otherTableId = assignedTableId === 1 ? 2 : 1; // Different table
  
  socket.emit('join_room', {
    mode: 'tournament',
    tableId: otherTableId, // WRONG TABLE
    tournamentId: tournament.id,
    playerName: player.name
  });
  
  let errorMsg;
  socket.on('error', (msg) => { errorMsg = msg; });
  
  await wait(100);
  
  expect(errorMsg).toContain('Not your assigned table');
});
```

- [ ] **Step 1: Add test to integration test file**

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="rejects.*non-assigned"
```

Expected: `FAIL` — Join guard doesn't verify assigned table

#### Task 26: Implement—Add join guard in joinRoom.js (tournament path)

**Files:**
- Modify: `server/socket/handlers/joinRoom.js` (lines 157–207, tournament mode join logic)

**Find the tournament join path. Add verification before seating:**

**Add after line ~165 (before gm.addPlayer):**

```javascript
if (mode === 'tournament') {
  // Verify player is assigned to this table
  const tourRepo = new TournamentRepository(supabase);
  const isAssigned = await tourRepo.verifyAssignedTable(playerId, tournamentId, tableId);
  if (!isAssigned) {
    return socket.emit('error', 'Not your assigned table');
  }
  
  // Check if join window is open (end of blind level 1)
  const tournament = await tourRepo.get(tournamentId);
  const BLIND_LEVEL_DURATION_MS = 20 * 60 * 1000; // Fetch from TournamentController config
  const levelEndTime = new Date(tournament.started_at.getTime() + BLIND_LEVEL_DURATION_MS);
  if (Date.now() > levelEndTime) {
    return socket.emit('error', 'Late registration closed');
  }
  
  // Mark player as active (not a no-show)
  await tourRepo.markPlayerActive(playerId, tournamentId);
}
```

- [ ] **Step 1: Locate tournament join path in joinRoom.js**

Search for `mode === 'tournament'` or similar.

- [ ] **Step 2: Add verification block shown above**

Insert before the `gm.addPlayer()` call.

- [ ] **Step 3: Verify TournamentRepository is imported**

Check top of joinRoom.js. If not imported:
```javascript
const TournamentRepository = require('../../db/repositories/TournamentRepository');
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- server/socket/__tests__/integration.test.js --testNamePattern="rejects.*non-assigned"
```

Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add server/socket/handlers/joinRoom.js
git commit -m "feat: tournament join verifies assigned table and late-reg window"
```

---

#### Task 27: Add—Tournament late-joiner spectator logic

**Files:**
- Modify: `server/socket/handlers/joinRoom.js` (tournament path, after guard passes)

**After verifying assigned table, add spectator logic (reuses Issue A):**

```javascript
// If mid-hand, mark as spectator per Issue A
if (gm.state.phase !== 'waiting') {
  gm.setPlayerInHand(socket.id, false);
}
```

**This should go AFTER the `gm.addPlayer()` call in tournament path.**

- [ ] **Step 1: Locate gm.addPlayer call in tournament join path**

- [ ] **Step 2: Add spectator check immediately after**

```javascript
gm.addPlayer(socket.id, playerName, isCoach, playerId);

// If joining mid-hand, mark as spectator (Issue A)
if (gm.state.phase !== 'waiting') {
  gm.setPlayerInHand(socket.id, false);
}
```

- [ ] **Step 3: No new test needed**

This reuses existing Issue A logic (already tested in Task 3).

- [ ] **Step 4: Commit**

```bash
git add server/socket/handlers/joinRoom.js
git commit -m "feat: tournament late-joiners spectate until next hand (Issue A integration)"
```

---

#### Task 28: Add—Tournament no-show bust at blind level 1 end

**Files:**
- Modify: `server/game/TournamentController.js` (blind level timer callback)

**Find where blind levels are managed (likely in `advanceBlindLevel()` or similar). Add call at end of level 1:**

```javascript
async advanceBlindLevel() {
  // ... existing blind level increment logic ...
  
  if (this.currentBlindLevel === 1) {
    // End of blind level 1: bust no-show players
    const tourRepo = new TournamentRepository(supabase);
    const bustedCount = await tourRepo.bustMissingPlayers(
      this.tournamentId,
      this.blindLevelDurationMs
    );
    
    if (bustedCount > 0) {
      io.to(this.roomId).emit('tournament:players_busted_no_show', {
        count: bustedCount,
        message: `${bustedCount} player(s) busted for not joining`
      });
    }
  }
}
```

- [ ] **Step 1: Locate blind level advancement in TournamentController.js**

- [ ] **Step 2: Add bustMissingPlayers call after level 1 completes**

- [ ] **Step 3: Verify TournamentRepository is imported**

If not, add at top of TournamentController.js.

- [ ] **Step 4: Broadcast event for organizer visibility**

Include the broadcast shown above.

- [ ] **Step 5: No unit test required**

(Integration test will verify blind progression logic)

- [ ] **Step 6: Commit**

```bash
git add server/game/TournamentController.js
git commit -m "feat: auto-bust no-show players at end of blind level 1"
```

---

#### Task 29: Update—Tournament lobby to show assigned table

**Files:**
- Modify: `client/src/pages/TournamentLobby.jsx`

**Find player registration display. Add assigned table info:**

**Current (approx):**
```jsx
const registration = usePlayerTournamentRegistration(tournament.id);

return (
  <div>
    <h2>{tournament.name}</h2>
    {/* ... tournament info ... */}
  </div>
);
```

**Change to:**

```jsx
const registration = usePlayerTournamentRegistration(tournament.id);

return (
  <div>
    <h2>{tournament.name}</h2>
    
    {registration && (
      <div className="assigned-table-info">
        <h3>Your Table</h3>
        <p className="table-number">Table {registration.assigned_table_number || registration.assigned_table_id}</p>
        
        <button
          className="btn-primary"
          disabled={tournament.state.phase !== 'waiting'}
          onClick={() => joinAssignedTable(registration.assigned_table_id)}
        >
          {tournament.state.phase === 'waiting' ? 'Join Table' : 'Hand in Progress'}
        </button>
      </div>
    )}
    
    {/* ... rest of lobby ... */}
  </div>
);
```

**Add handler:**

```javascript
const joinAssignedTable = (tableId) => {
  socket.emit('join_room', {
    mode: 'tournament',
    tableId,
    tournamentId: tournament.id,
    playerName: registration.player_name
  });
};
```

- [ ] **Step 1: Locate TournamentLobby.jsx**

- [ ] **Step 2: Find where tournament registration is displayed**

- [ ] **Step 3: Add assigned table section with table number and join button**

Copy the code shown above.

- [ ] **Step 4: Add joinAssignedTable handler**

- [ ] **Step 5: Disable button when hand in progress**

Set `disabled={tournament.state.phase !== 'waiting'}` on button.

- [ ] **Step 6: No unit test required**

(Visual/integration testing in browser)

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TournamentLobby.jsx
git commit -m "feat: show assigned table in tournament lobby with one-click join"
```

---

## Summary & Testing Checklist

**Build order:** A (3 tasks) → F (9 tasks) → C (6 tasks) = 18 tasks total

**Tests to run before merge:**

```bash
# Unit tests
npm test -- server/game/__tests__/gameFlowFixes.test.js
npm test -- server/db/repositories/__tests__/TournamentRepository.test.js
npm test -- server/lifecycle/__tests__/idleTimer.test.js

# Integration tests
npm test -- server/socket/__tests__/integration.test.js
npm test -- server/routes/__tests__/tournaments.test.js

# Regression
npm test -- server/game/__tests__/GameManager.test.js
npm test -- server/game/__tests__/positions.test.js (if exists)

# Full suite
npm test
```

**Live validation:**
- Real coach + 2 players game
- Mid-hand join → spectate → rejoin
- Player reaches 0 chips → sit out → rebuy → rejoin
- Tournament register → assigned table shown → one-click join
- No-show player auto-busted at level 1 end
