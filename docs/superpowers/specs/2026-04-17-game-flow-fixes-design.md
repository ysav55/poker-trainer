# Game Flow Fixes — Design Spec
**Date:** 2026-04-17  
**Priority:** A > C ≈ F  
**Approach:** Comprehensive (fixes + safeguards)  
**Testing:** Unit + Integration + Live validation

---

## Overview

Three interconnected game flow issues from real-game test (2026-04-16):

1. **Issue A: Mid-Hand Join** — Player joins during active hand → should spectate until next hand
2. **Issue C: Zero-Chip Handling** — Player reaches 0 chips → should sit out, rebuy, auto-kick if idle
3. **Issue F: Tournament Assignment** — Players register, then find table → should auto-assign and reserve seats

**Scope:** Game mechanics, DB schema (tournament tables), socket handlers, state machine logic  
**User Experience:** Silent, natural (like casino), no friction  
**Test Coverage:** Unit + Integration + Live game with coach + players

---

## Issue A: Mid-Hand Join (Spectator Flow)

### Current Behavior
Player joins table during active hand → added to `GameManager` → assigned betting options → no cards → confusion.

### Desired Behavior
- Player joins mid-hand → becomes spectator for that hand
- Sees all action in real-time (no blocking)
- Automatically joins next hand as normal seated player (at correct position)
- Table sees no toast/notification (silent join, like casino)

### Design

#### Socket Handler: `server/socket/handlers/joinRoom.js`

**Location:** `registerJoinRoom`, line ~265 (after `gm.addPlayer()` call)

**Current code:**
```javascript
gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);
```

**Change:** Add phase check before adding:
```javascript
gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);

// If hand is active, mark player as spectator for this hand
if (gm.state.phase !== 'waiting') {
  gm.setPlayerInHand(socket.id, false);
}
```

**Rationale:** `setPlayerInHand(playerId, false)` marks player as seated but not in active hand. They get no cards, no betting options, just observe.

#### Game State: `server/game/GameManager.js`

**Location:** `_finishHand()` method (line ~800, approximate)

**Change:** Auto-rejoin spectators when hand ends:
```javascript
// At end of _finishHand(), after resolving showdown:
for (const player of Object.values(this.state.players)) {
  if (player.is_seated && !player.in_hand && player.stack > 0) {
    this.setPlayerInHand(player.id, true);
  }
}
```

**Rationale:** Anyone who was sitting out (and still seated) rejoins next hand automatically. If they reached 0 chips, they stay out (Issue C handles that).

**Note:** `setPlayerInHand(playerId, boolean)` already exists (lines 240–245). No new method needed.

#### Socket Broadcast: Client Awareness

**Current:** `player:joined` event broadcasts to room.

**Change:** Add `is_spectating` flag to broadcast when `gm.state.phase !== 'waiting'`:
```javascript
io.to(tableId).emit('player:joined', {
  playerId: socket.id,
  name: trimmedName,
  stack: player.stack,
  is_spectating: true  // ADD THIS
});
```

**Rationale:** Clients can optionally show "Player X is watching" without toast (just visual indicator if desired). No toasts required; silent is preferred.

#### Testing

**Unit:**
- `addPlayer()` with phase !== 'waiting' calls `setPlayerInHand(false)`
- `setPlayerInHand(false)` prevents player from appearing in `hand_actions` table
- `_finishHand()` calls `setPlayerInHand(true)` for all sitting-out players with `stack > 0`

**Integration:**
- Join table mid-flop → player seated but not in `hand_actions`
- Flop, turn, river play out → player not dealt cards
- Hand ends → `showdown_result` broadcast
- Next hand starts → player is in `hand_actions` at correct position
- Regression: Existing mid-hand player elimination unaffected

---

## Issue C: Zero-Chip Handling

### Current Behavior
- Player reaches 0 chips → stays dealt into next hand → game may break
- Coach at 0 in coached game → entire game halts
- 0-chip players assigned positions (take seats, break position math)
- No idle timeout for inactive tables

### Desired Behavior
- Player reaches 0 → auto sits out for next hand
- Can rebuy from chip bank anytime (auto-cash) or via coach (coached)
- Stays seated while at 0 (not kicked immediately)
- Game continues if 2+ active players (non-zero chips)
- Auto-kicked after 5 min idle (auto-cash only; coached games exempt for study time)
- Position map skips 0-chip players (no seat assignments)

### Design

#### Game Start Validation: `server/game/GameManager.js`

**Location:** `startGame()` method, lines 454–458

**Current code:**
```javascript
const brokePlayers = seated.filter(p => p.stack === 0);
if (brokePlayers.length > 0) {
  return { success: false, message: `Cannot start: ${brokePlayers.map(p => p.name).join(', ')} have 0 chips` };
}
```

**Change:** Auto-sit-out broke players instead of blocking:
```javascript
// Auto-sit-out broke players
for (const player of seated.filter(p => p.stack === 0)) {
  this.setPlayerInHand(player.id, false);
}

// Proceed with game start (don't block)
const activePlayers = seated.filter(p => p.stack > 0);
if (activePlayers.length < 2) {
  return { success: false, message: 'Need at least 2 active players to start' };
}
```

**Rationale:** Game can proceed with 2+ active (non-zero) players. Broke players spectate until they rebuy.

#### Position Mapping: `server/game/positions.js`

**Location:** `buildPositionMap()` function, line ~51

**Current code:**
```javascript
const seated = Object.values(players).filter(p => p.is_seated);
```

**Change:** Filter out 0-chip players:
```javascript
const seated = Object.values(players).filter(p => p.is_seated && p.stack > 0);
```

**Rationale:** 0-chip players don't take position slots. Position order only includes active players.

#### Rebuy Flow: New Socket Handler

**File:** `server/socket/handlers/gameLifecycle.js` (or new file `rebuy.js`)

**Handler:** `table:player_rebuy`

**Logic:**
```javascript
socket.on('table:player_rebuy', async (data) => {
  const { playerId, amount } = data;
  
  // Validate: player is seated, at 0 chips, in auto-cash mode
  const player = gm.state.players[playerId];
  if (!player || player.stack !== 0 || !player.is_seated) {
    return socket.emit('error', 'Invalid rebuy state');
  }
  if (tableMode !== 'uncoached_cash') {
    return socket.emit('error', 'Rebuy only in auto-cash mode');
  }
  
  // Rebuy from chip bank
  const chipBank = await ChipBankRepository.getBalance(playerId);
  if (chipBank.balance < amount) {
    return socket.emit('error', 'Insufficient chip bank balance');
  }
  
  await ChipBankRepository.adjustBalance(playerId, -amount);
  gm.updatePlayerStack(playerId, amount);
  gm.setPlayerInHand(playerId, true); // Re-enable for next hand
  
  io.to(tableId).emit('player:rebuyed', { playerId, newStack: amount });
});
```

**Coached mode:** No socket rebuy. Coach uses existing controls to `updatePlayerStack()` directly. Coach can top up at any time.

**When allowed:** Only during sitting-out hand (phase === 'waiting'). Blocked if hand in progress.

#### Idle Timeout: `server/lifecycle/idleTimer.js`

**Location:** Existing idle timer module (lines ~30)

**Current:** Global 20-min idle shutdown  
**Add:** Per-table 5-min idle check (auto-cash only)

**Logic:**
```javascript
const TABLE_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function checkTableIdle(tableId, table) {
  // Skip coached mode
  if (table.tableMode === 'coached_cash') return;
  
  // Check if any action in last 5 min
  const lastAction = table.lastActionAt || table.createdAt;
  if (Date.now() - lastAction > TABLE_IDLE_TIMEOUT_MS) {
    // Remove 0-chip idle players
    const toRemove = Object.values(table.players).filter(
      p => p.stack === 0 && p.is_seated && !p.is_active
    );
    
    toRemove.forEach(p => {
      table.removePlayer(p.id);
      io.to(tableId).emit('player:kicked_idle', { playerId: p.id, name: p.name });
    });
  }
}
```

**Triggered:** Every minute, check all active tables.

**Broadcast:** `player:kicked_idle` event to room (organizer sees "Player X was kicked for inactivity").

#### Hand Finish Rejoin: `server/game/GameManager.js`

**Location:** `_finishHand()` (same as Issue A)

**Update:** When auto-rejoining, skip 0-chip players:
```javascript
for (const player of Object.values(this.state.players)) {
  // Only rejoin if: seated + not in hand + has chips + still connected
  if (player.is_seated && !player.in_hand && player.stack > 0) {
    this.setPlayerInHand(player.id, true);
  }
}
```

**Rationale:** 0-chip players stay sitting out. They must rebuy to rejoin.

#### DB Schema: No changes
Chip bank already exists (`player_chip_bank` table). No migrations needed.

#### Testing

**Unit:**
- `startGame()` auto-sits broke players, returns success with 2+ active
- `buildPositionMap()` filters out 0-chip players
- `setPlayerInHand(playerId, false)` prevents player from appearing in deal logic
- Idle timeout: 0-chip idle players flagged for removal

**Integration:**
- Hand plays out → player loses all chips → stack === 0
- Next hand starts → player not dealt cards, not in position map
- Player rebuys (auto-cash) → chip bank deducted, stack updated, rejoins next hand
- Coach tops up (coached mode) → stack updates, player rejoins next hand
- Table idles 5+ min (auto-cash) → 0-chip player auto-kicked
- Coached table idles 5+ min → no kick (study time)
- Game state: 3 players, 1 at 0 chips, 2 active → game continues
- Game state: 2 players, 1 at 0 chips → blocked until rebuy or leave

**Regression:**
- Existing chip/stack tracking logic unchanged
- Showdown payout logic unchanged (dead chip logic)
- Hand analyzer unchanged

---

## Issue F: Tournament Table Assignment

### Current Behavior
- Players register for tournament (REST endpoint)
- No table assigned at registration
- Players must find/join available table (requires manual search)
- Late joiners can join any table with space

### Desired Behavior
- Table assigned at registration time
- Player sees "Your table: 3" in tournament info
- One-click "Join Table" from tournament lobby
- Seat reserved for assigned player
- Can join up to end of blind level 1 (grace period, prevents strategic lateness)
- Late-joiners dealt cards but auto-mocked if inactive (prevents advantage)
- No-show players (unconnected by end of level 1): chips → 0, placed in last positions
- If join mid-hand: spectator (Issue A flow) until next hand

### Design

#### DB Schema: Tournament Assignment

**File:** New migration `025_tournament_table_assignment.sql`

**Changes:**
```sql
ALTER TABLE tournament_registrations
ADD COLUMN assigned_table_id INT REFERENCES tournament_tables(id);

CREATE INDEX idx_tournament_registrations_assigned_table
ON tournament_registrations(tournament_id, assigned_table_id);
```

**Rationale:** Store which table each registered player is assigned to.

#### Registration Flow: `server/routes/tournaments.js`

**Location:** `POST /api/tournaments/:id/register` endpoint

**Current code:** Adds player to `tournament_registrations`

**Change:** Assign table at registration:
```javascript
const tournamentsRepo = new TournamentRepository(supabase);
const tournament = await tournamentsRepo.get(tournamentId);

// Find least-full table for this tournament
const availableTable = await tournamentsRepo.findLeastFullTable(tournamentId);
if (!availableTable) {
  return res.status(400).json({ error: 'No tables available' });
}

// Register and assign
const registration = await tournamentsRepo.addPlayerToTournament(playerId, tournamentId, {
  assigned_table_id: availableTable.id
});

return res.json({
  success: true,
  registration,
  assignedTableId: availableTable.id,
  assignedTableNumber: availableTable.table_number
});
```

**Client side:** Show "You're at Table 3 — join when ready"

#### TournamentRepository: New Methods

**File:** `server/db/repositories/TournamentRepository.js`

**Add:**
```javascript
async findLeastFullTable(tournamentId) {
  // Find table with fewest registered players
  const tables = await this.supabase
    .from('tournament_tables')
    .select('id, table_number, capacity, (select count(*) from tournament_registrations where assigned_table_id = id) as registered_count')
    .eq('tournament_id', tournamentId)
    .order('registered_count', { ascending: true })
    .limit(1);
  
  return tables.data?.[0] || null;
}

async verifyAssignedTable(playerId, tournamentId, tableId) {
  // Check if player is assigned to this table
  const reg = await this.supabase
    .from('tournament_registrations')
    .select('assigned_table_id')
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .single();
  
  return reg.data?.assigned_table_id === tableId;
}

async markPlayerActive(playerId, tournamentId) {
  // Update last_action_at for no-show tracking
  await this.supabase
    .from('tournament_registrations')
    .update({ last_action_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId);
}

async bustMissingPlayers(tournamentId) {
  // At end of blind level 1: set stack = 0 for no-shows
  const blindLevel1EndTime = new Date(Date.now() - BLIND_LEVEL_DURATION);
  
  const noShows = await this.supabase
    .from('tournament_registrations')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .lt('last_action_at', blindLevel1EndTime.toISOString());
  
  for (const { player_id } of noShows.data) {
    await this.supabase
      .from('tournament_players')
      .update({ stack: 0, busted_at: new Date().toISOString() })
      .eq('player_id', player_id)
      .eq('tournament_id', tournamentId);
  }
}
```

#### Tournament Lobby UI: Client Side

**File:** `client/src/pages/TournamentLobby.jsx`

**Show assigned table:**
```jsx
const registration = tournament.player_registration;

return (
  <div>
    <h2>{tournament.name}</h2>
    <div className="assigned-table">
      Your Table: <strong>{registration.assigned_table_number}</strong>
    </div>
    <button
      disabled={tournament.state.phase !== 'waiting'}
      onClick={() => joinTable(registration.assigned_table_id)}
    >
      Join Table
    </button>
  </div>
);
```

**Button disabled if:** Hand in progress OR outside join window (after blind level 1)

#### Join Guard: `server/socket/handlers/joinRoom.js`

**Location:** Tournament mode join logic, lines 157–207

**Current code:** Checks `isLateRegOpen()`, allows any open table

**Change: Add assigned table verification:**
```javascript
if (mode === 'tournament') {
  // Verify player is assigned to this table
  const isAssigned = await tournamentsRepo.verifyAssignedTable(playerId, tournamentId, tableId);
  if (!isAssigned) {
    return socket.emit('error', 'Not your assigned table');
  }
  
  // Check if join window is open (end of blind level 1)
  const tournament = await tournamentsRepo.get(tournamentId);
  const levelEndTime = new Date(tournament.started_at.getTime() + BLIND_LEVEL_DURATION);
  if (Date.now() > levelEndTime) {
    return socket.emit('error', 'Late registration closed');
  }
  
  // Mark player as active (not a no-show)
  await tournamentsRepo.markPlayerActive(playerId, tournamentId);
  
  // Proceed with join
  gm.addPlayer(socket.id, playerName, isCoach, playerId);
  
  // If mid-hand, apply Issue A spectator flow
  if (gm.state.phase !== 'waiting') {
    gm.setPlayerInHand(socket.id, false);
  }
}
```

#### Late-Joiner Auto-Mock Logic

**Location:** `server/game/bettingRound.js` or new `lateLateJoinMock.js`

**When player action is requested:**
- Check if player joined after tournament start
- If yes AND player is not actively connected: auto-fold/mock
- This prevents "I'll skip early hands" advantage

**Implementation:**
```javascript
if (currentPlayer.joined_at > tournament.started_at && !isPlayerConnected(currentPlayer.id)) {
  // Auto-mock: fold on their action
  gm.placeBet(currentPlayer.id, 'fold');
}
```

**Rationale:** Mocked players stay in chip rotation (blind obligations) but don't play. Fair to on-time players.

#### No-Show Kicker: `server/game/TournamentController.js`

**Location:** End of blind level 1 timer callback

**Call:** `tournamentsRepo.bustMissingPlayers(tournamentId)`

**Effect:**
- Players with no action by end of level 1 → stack = 0
- They're busted (last place finisher)
- Their chips distributed to remaining players (per tournament payout logic)

**Broadcast:** Tournament organizer sees "Player X was busted (no-show)"

#### Testing

**Unit:**
- `findLeastFullTable()` returns least-full table
- `verifyAssignedTable()` returns true only for assigned player
- `bustMissingPlayers()` sets stack = 0 for unconnected players by blind level 1 end

**Integration:**
- Register for tournament → assigned to Table 3
- See "Your Table: 3" in lobby
- Click "Join Table" → seated at Table 3
- Join mid-hand (level 1) → spectator per Issue A flow
- Mid-hand → next hand starts → participate normally
- Join after level 1 ends → rejected ("Late registration closed")
- Player registers, never connects → auto-busted at level 1 end, chips → pool
- Player joins but not active on action → auto-mocked, still in blind rotation

**Regression:**
- Existing tournament blind progression unchanged
- Existing chip payout logic unchanged
- Table-based vs. standalone tournament distinction maintained

---

## Dependencies & Build Order

**Recommended order:** A → F → C

1. **A first** (lowest complexity, highest priority)
   - Changes: joinRoom.js, GameManager._finishHand()
   - No DB changes
   - Unblocks F (late-join spectator logic reuses A)

2. **F second** (medium complexity, medium priority)
   - Changes: tournaments.js, TournamentRepository, joinRoom.js tournament path, new migration
   - Depends on: A (spectator flow for mid-hand joins)
   - Unblocks: Nothing critical

3. **C third** (highest complexity, second priority)
   - Changes: GameManager.startGame(), positions.js, new socket handler, idleTimer.js
   - Depends on: None
   - Safe to run independently anytime

**Can F and C run in parallel?** Yes, they don't touch shared code paths.

---

## Testing Summary

| Issue | Unit Tests | Integration Tests | Live Test Scenario |
|-------|-----------|------------------|-------------------|
| **A** | 3 | 3 | Join mid-hand → spectate → rejoin |
| **C** | 4 | 5 | Reach 0 → rebuy → play; idle timeout |
| **F** | 3 | 5 | Register → join → late-join → no-show |
| **Total** | **10** | **13** | **3 scenarios** |

**Regression targets:** Hand analyzer, position mapping, chip tracking, tournament blind progression, showdown resolution.

---

## Success Criteria

- ✅ A: Player joins mid-hand → spectates → auto-joins next hand (no confusion)
- ✅ C: Player at 0 chips → sits out, can rebuy, game continues with 2+ active
- ✅ F: Player registers → auto-assigned table → one-click join → seat reserved
- ✅ All: No console errors, zero unhandled promise rejections
- ✅ All: Existing tests pass (no regressions)
- ✅ All: Live game test with coach + players validates flows
