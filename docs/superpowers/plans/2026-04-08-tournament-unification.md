# Tournament System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Unify all tournaments under `TournamentGroupController` as the single orchestrator — a single-table tournament is a group with `ceil(n/7) = 1` table — and expose registration, start, cancel, finalize flows through new REST endpoints and new client pages.

**Architecture:** `TournamentGroupController` gains `assignPlayersToTables`, `rebalanceTables`, and `distributePrizes` methods; registration is tracked in a new `tournament_group_registrations` table; the `TournamentSetup` wizard is redirected from the deprecated System A endpoint to `POST /api/tournament-groups`; three new client pages (`TournamentListPage`, `TournamentDetailPage`, `TournamentControlPage`) replace the old per-table flow.

**Tech Stack:** Node.js/Express, Socket.io, Supabase (Postgres), React/Vite/Tailwind, Vitest (client tests), Jest + supertest (server tests).

---

## Pre-flight: Batch 0 status

> **All five Batch 0 fixes (C-1, C-14, C-15, C-16, C-17) are already present in the codebase:**
> - C-14: `supabase/migrations/046_fix_tournament_referees_constraint.sql` — exists
> - C-1: `server/auth/tournamentAuth.js` — already uses `let query` with reassignment
> - C-15: `server/socket/handlers/betting.js` — already has `['uncoached_cash', 'tournament'].includes(ctrl?.getMode?.())`
> - C-16: `server/game/controllers/TournamentController.js` `start()` — already calls `this._startHand()`
> - C-17: `server/socket/handlers/tournament.js` `tournament:move_player` — already uses positional args
>
> No Batch 0 work is required. Proceed directly to Task 1.

---

## File Map

| Status | File | What changes |
|--------|------|-------------|
| Create | `supabase/migrations/047_tournament_groups_registration_fields.sql` | Extend `tournament_groups`; add chip enum values |
| Create | `supabase/migrations/048_tournament_group_registrations.sql` | New `tournament_group_registrations` table |
| Modify | `server/db/repositories/TournamentGroupRepository.js` | Add registration CRUD + `listGroups` with filters |
| Modify | `server/game/controllers/TournamentGroupController.js` | Add `assignPlayersToTables`, `rebalanceTables`, `distributePrizes`; update `onPlayerEliminated` |
| Modify | `server/routes/tournamentGroups.js` | Add GET list, POST register, DELETE unregister, PATCH start, PATCH cancel, POST finalize; extend POST create |
| Create | `server/routes/__tests__/tournamentGroups.test.js` | Route-level tests for all new endpoints |
| Modify | `client/src/pages/admin/TournamentSetup.jsx` | Add privacy + late-reg fields; change POST target to `/api/tournament-groups` |
| Modify | `client/src/App.jsx` | Add `/tournaments`, `/tournaments/:groupId`, `/tournaments/:groupId/control` routes |
| Modify | `client/src/components/SideNav.jsx` | Add Tournaments nav item between Lobby and Leaderboard |
| Create | `client/src/pages/TournamentListPage.jsx` | Three-tab list; Create button (coach/admin) |
| Create | `client/src/pages/TournamentDetailPage.jsx` | Detail + register/join/control buttons; handles rebalance socket |
| Create | `client/src/pages/TournamentControlPage.jsx` | Multi-table grid; global controls bar |
| Modify | `client/src/pages/LobbyPage.jsx` | Upcoming tournaments strip; update `handleTournamentCreated` callback |

---

## Task 1: Migration 047 — Extend `tournament_groups` + chip enum values

**Files:**
- Create: `supabase/migrations/047_tournament_groups_registration_fields.sql`

- [x] **Step 1: Write the migration**

```sql
-- supabase/migrations/047_tournament_groups_registration_fields.sql
-- Extend tournament_groups with registration/scheduling/prize fields.
-- Add tournament transaction types to chip_transaction_type enum.

BEGIN;

-- 1. Extend tournament_groups
ALTER TABLE tournament_groups
  ADD COLUMN IF NOT EXISTS buy_in           INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS privacy          TEXT         NOT NULL DEFAULT 'public'
                                            CHECK (privacy IN ('public', 'school', 'private')),
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_structure JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS late_reg_enabled BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reg_minutes INTEGER      NOT NULL DEFAULT 20;

-- 2. Add tournament transaction types to existing enum
--    (Postgres requires individual ADD VALUE statements outside a transaction block
--     when adding to an existing enum. Run each separately if inside a transaction.)
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_entry';
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_refund';
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_prize';

COMMIT;
```

> **Note for applying:** Postgres `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on older versions. If the migration runner wraps in BEGIN/COMMIT, move the three `ALTER TYPE` statements above the `BEGIN` line or apply them manually via `psql`. Supabase Dashboard SQL editor handles this correctly.

- [x] **Step 2: Apply migration via Supabase Dashboard**

Open Supabase Dashboard → SQL Editor → paste and run the migration content. Verify the three new columns appear in `tournament_groups` and the enum has the three new values:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tournament_groups'
  AND column_name IN ('buy_in','privacy','scheduled_at','payout_structure','late_reg_enabled','late_reg_minutes');

SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE pg_type.typname = 'chip_transaction_type'
ORDER BY enumsortorder;
```

Expected: 6 columns found, enum includes `tournament_entry`, `tournament_refund`, `tournament_prize`.

- [x] **Step 3: Commit migration file**

```bash
git add supabase/migrations/047_tournament_groups_registration_fields.sql
git commit -m "feat(db): migration 047 — extend tournament_groups + tournament chip types"
```

---

## Task 2: Migration 048 — `tournament_group_registrations` table

**Files:**
- Create: `supabase/migrations/048_tournament_group_registrations.sql`

- [x] **Step 1: Write the migration**

```sql
-- supabase/migrations/048_tournament_group_registrations.sql
-- Registration table: one row per (group, player), tracks status and buy-in paid.

BEGIN;

CREATE TABLE tournament_group_registrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES player_profiles(id),
  status        TEXT        NOT NULL DEFAULT 'registered'
                            CHECK (status IN ('registered', 'seated', 'busted', 'cancelled')),
  buy_in_amount INTEGER     NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, player_id)
);

CREATE INDEX idx_tgr_group   ON tournament_group_registrations(group_id);
CREATE INDEX idx_tgr_player  ON tournament_group_registrations(player_id);
CREATE INDEX idx_tgr_status  ON tournament_group_registrations(group_id, status);

COMMIT;
```

- [x] **Step 2: Apply migration via Supabase Dashboard**

Run in SQL Editor. Verify:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tournament_group_registrations';
```

Expected: `id`, `group_id`, `player_id`, `status`, `buy_in_amount`, `registered_at`.

- [x] **Step 3: Commit migration file**

```bash
git add supabase/migrations/048_tournament_group_registrations.sql
git commit -m "feat(db): migration 048 — tournament_group_registrations table"
```

---

## Task 3: TournamentGroupRepository — registration CRUD + listGroups filters

**Files:**
- Modify: `server/db/repositories/TournamentGroupRepository.js`

- [x] **Step 1: Add registration methods to the repository**

Open `server/db/repositories/TournamentGroupRepository.js`. After the existing `getStandings` method (before the closing `};`), add:

```js
  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a player for a group tournament. Throws if already registered.
   * buyInAmount should be 0 when buy_in = 0 on the group.
   */
  async createRegistration(groupId, playerId, buyInAmount = 0) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .insert({ group_id: groupId, player_id: playerId, buy_in_amount: buyInAmount, status: 'registered' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /**
   * Cancel a registration (mark status = 'cancelled').
   * Only works if tournament has not started (status = 'pending').
   */
  async cancelRegistration(groupId, playerId) {
    const { error } = await supabase
      .from('tournament_group_registrations')
      .update({ status: 'cancelled' })
      .eq('group_id', groupId)
      .eq('player_id', playerId)
      .eq('status', 'registered');
    if (error) throw error;
  },

  /**
   * Update a registration's status field.
   * status: 'registered' | 'seated' | 'busted' | 'cancelled'
   */
  async updateRegistrationStatus(groupId, playerId, status) {
    const { error } = await supabase
      .from('tournament_group_registrations')
      .update({ status })
      .eq('group_id', groupId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  /**
   * Get all non-cancelled registrations for a group.
   * Includes player display_name via join.
   */
  async getRegistrations(groupId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('*, player_profiles(display_name)')
      .eq('group_id', groupId)
      .neq('status', 'cancelled')
      .order('registered_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Get the buy_in_amount for a single registration.
   * Returns null if not found or cancelled.
   */
  async getRegistration(groupId, playerId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('id, status, buy_in_amount')
      .eq('group_id', groupId)
      .eq('player_id', playerId)
      .neq('status', 'cancelled')
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  /**
   * Sum of all non-cancelled buy_in_amount values — the total prize pool.
   */
  async getTotalPrizePool(groupId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('buy_in_amount')
      .eq('group_id', groupId)
      .neq('status', 'cancelled');
    if (error) throw error;
    return (data ?? []).reduce((sum, r) => sum + (r.buy_in_amount ?? 0), 0);
  },
```

Also **replace the existing `listGroups` method** with a version that supports filters:

```js
  async listGroups({ schoolId = null, status = null, privacy = null } = {}) {
    let q = supabase.from('tournament_groups').select('*').order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    if (status)   q = q.eq('status', status);
    if (privacy)  q = q.eq('privacy', privacy);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
```

- [x] **Step 2: Run existing server tests to confirm nothing broke**

```bash
cd c:\Users\user\poker-trainer && npx jest server/db/__tests__ --testPathPattern="" 2>&1 | tail -20
```

Expected: all DB repository tests pass (no new failures).

- [x] **Step 3: Commit**

```bash
git add server/db/repositories/TournamentGroupRepository.js
git commit -m "feat(repo): tournament group registration CRUD + listGroups filters"
```

---

## Task 4: TournamentGroupController — assignPlayersToTables, rebalanceTables, distributePrizes

**Files:**
- Modify: `server/game/controllers/TournamentGroupController.js`

Read the file before editing. The existing class ends at line ~358. You will:
1. Add three new methods before `destroy()`
2. Update `onPlayerEliminated` to trigger rebalancing and update registration status

- [x] **Step 1: Add `assignPlayersToTables` method**

Insert before the `destroy()` method (around line 352):

```js
  /**
   * Calculate table count (ceil(n/7)) and assign players round-robin.
   * Creates tables in DB, links them to this group, creates tournament configs,
   * then emits tournament_group:player_assigned to each player's socket.
   *
   * @param {Array<{ playerId: string, name: string }>} players — registered players
   * @param {{ blindSchedule: Array, startingStack: number }} config
   */
  async assignPlayersToTables(players, config) {
    const { TableRepository }      = require('../../db/repositories/TableRepository');
    const { TournamentRepository } = require('../../db/repositories/TournamentRepository');
    const supabase                 = require('../../db/supabase');

    const numTables = Math.max(1, Math.ceil(players.length / 7));
    const tableIds  = [];

    for (let i = 0; i < numTables; i++) {
      const tableId = `tournament-group-${this.groupId}-table-${i + 1}`;
      await TableRepository.createTable({
        id:        tableId,
        name:      `${this.config?.name ?? 'Tournament'} — Table ${i + 1}`,
        mode:      'tournament',
        createdBy: this.config?.created_by ?? null,
        config:    { starting_stack: config.startingStack ?? 10000, tournament_group_id: this.groupId },
      });
      await supabase.from('tables').update({ tournament_group_id: this.groupId }).eq('id', tableId);
      await TournamentRepository.createConfig({
        tableId,
        blindSchedule:    config.blindSchedule ?? [],
        startingStack:    config.startingStack  ?? 10000,
        lateRegEnabled:   config.lateRegEnabled ?? false,
        lateRegMinutes:   config.lateRegMinutes ?? 0,
        payoutStructure:  config.payoutStructure ?? [],
      });
      tableIds.push(tableId);
    }

    this.tableIds = tableIds;

    // Round-robin seat assignment — emit player_assigned to each player's socket
    const sockets = this.io.sockets.sockets;
    players.forEach((player, idx) => {
      const tableId = tableIds[idx % numTables];

      // Find current socket for this player
      let socketId = null;
      const { stableIdMap } = require('../../state/SharedState');
      for (const [sid, stableId] of stableIdMap.entries()) {
        if (stableId === player.playerId) { socketId = sid; break; }
      }

      this.io.to(player.playerId).emit('tournament_group:player_assigned', {
        groupId: this.groupId,
        tableId,
        seat:    null, // seat assigned at join_room
      });

      // Also emit directly to socket if found
      if (socketId) {
        const sock = sockets?.get(socketId);
        if (sock) {
          sock.emit('tournament_group:player_assigned', { groupId: this.groupId, tableId, seat: null });
        }
      }
    });

    return tableIds;
  }

  /**
   * Rebalance tables when any table drops to ≤ 3 active players.
   * Moves one player from the largest table to the smallest.
   * Removes empty tables from this.tableIds.
   * Stops when only 1 table remains (final table).
   */
  async rebalanceTables() {
    const { getController } = require('../../state/SharedState');

    if (this.tableIds.length <= 1) return; // final table — do not merge

    // Build active-player counts per table
    const tableCounts = this.tableIds.map(tableId => {
      const ctrl  = getController(tableId);
      const state = ctrl?.gm?.getState?.() ?? {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return { tableId, count: active.length, players: active };
    });

    // Remove tables that have been emptied
    const emptyTables = tableCounts.filter(t => t.count === 0);
    for (const { tableId } of emptyTables) {
      this.tableIds = this.tableIds.filter(id => id !== tableId);
    }

    if (this.tableIds.length <= 1) return; // collapsed to final table

    // Re-snapshot after removal
    const activeCounts = this.tableIds.map(tableId => {
      const ctrl  = getController(tableId);
      const state = ctrl?.gm?.getState?.() ?? {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return { tableId, count: active.length, players: active };
    });

    const underTables = activeCounts.filter(t => t.count <= 3 && t.count > 0);
    if (underTables.length === 0) return; // no rebalancing needed

    // Sort: largest first, smallest last
    const sorted = [...activeCounts].sort((a, b) => b.count - a.count);
    const largest  = sorted[0];
    const smallest = sorted[sorted.length - 1];

    if (largest.tableId === smallest.tableId) return; // only one table effectively

    // Pick the last active player from the largest table to move
    const playerToMove = largest.players[largest.players.length - 1];
    if (!playerToMove) return;

    const playerId = playerToMove.stable_id ?? playerToMove.id;
    try {
      await this.movePlayer(playerId, largest.tableId, smallest.tableId);

      // Notify moved player via socket
      const { stableIdMap } = require('../../state/SharedState');
      for (const [sid, stableId] of stableIdMap.entries()) {
        if (stableId === playerId) {
          const sock = this.io.sockets.sockets?.get(sid);
          if (sock) {
            sock.emit('tournament_group:rebalance', {
              newTableId: smallest.tableId,
              newSeat:    null,
            });
          }
          break;
        }
      }
    } catch (err) {
      // Non-fatal — log but don't crash tournament
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('notification', { type: 'warning', message: `Rebalance failed: ${err.message}` });
      }
    }

    // If the largest table is now empty, remove it
    const largestCtrl  = getController(largest.tableId);
    const largestState = largestCtrl?.gm?.getState?.() ?? {};
    const remaining = (largestState.seated ?? largestState.players ?? []).filter(p => (p.stack ?? 0) > 0);
    if (remaining.length === 0) {
      this.tableIds = this.tableIds.filter(id => id !== largest.tableId);
    }
  }

  /**
   * Distribute prizes to top finishers based on payout_structure.
   * prize = totalPool * percentage / 100, rounded down.
   * First place receives any remainder (rounding correction).
   *
   * @param {Array<{ playerId: string, place: number }>} finalStandings — ordered 1st…nth
   */
  async distributePrizes(finalStandings) {
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    const { TournamentGroupRepository } = require('../../db/repositories/TournamentGroupRepository');

    const group = await TournamentGroupRepository.getGroup(this.groupId);
    const payoutStructure = group?.payout_structure ?? [];
    const totalPool = await TournamentGroupRepository.getTotalPrizePool(this.groupId);

    if (totalPool <= 0 || payoutStructure.length === 0) {
      // No prize pool (free tournament) — just mark finished
      await TournamentGroupRepository.updateStatus(this.groupId, 'finished');
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('tournament_group:ended', { groupId: this.groupId, standings: finalStandings });
      }
      return;
    }

    // Calculate prizes for each payout position
    // payout_structure: [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, ...]
    const sorted = [...payoutStructure].sort((a, b) => a.place - b.place);
    const prizes = sorted.map(tier => ({
      place:     tier.place,
      amount:    Math.floor(totalPool * tier.percentage / 100),
      playerId:  finalStandings.find(s => s.place === tier.place)?.playerId ?? null,
    }));

    // Give remainder to 1st place (rounding correction)
    const distributed = prizes.reduce((s, p) => s + p.amount, 0);
    const firstPrize  = prizes.find(p => p.place === 1);
    if (firstPrize) firstPrize.amount += (totalPool - distributed);

    // Credit each winner's chip bank and emit prize notification
    for (const prize of prizes) {
      if (!prize.playerId || prize.amount <= 0) continue;
      try {
        const newBalance = await ChipBankRepository.applyTransaction({
          playerId:  prize.playerId,
          amount:    prize.amount,
          type:      'tournament_prize',
          tableId:   null,
          createdBy: null,
          notes:     `Tournament prize — place ${prize.place}`,
        });

        // Emit to the winner's socket directly
        const { stableIdMap } = require('../../state/SharedState');
        for (const [sid, stableId] of stableIdMap.entries()) {
          if (stableId === prize.playerId) {
            const sock = this.io.sockets.sockets?.get(sid);
            if (sock) {
              sock.emit('tournament_group:prize_awarded', {
                amount:     prize.amount,
                place:      prize.place,
                newBalance,
              });
            }
            break;
          }
        }
      } catch (err) {
        // Non-fatal — tournament still finishes
        for (const tableId of this.tableIds) {
          this.io.to(tableId).emit('notification', { type: 'warning', message: `Prize credit failed for place ${prize.place}: ${err.message}` });
        }
      }
    }

    await TournamentGroupRepository.updateStatus(this.groupId, 'finished');

    const standings = await TournamentGroupRepository.getStandings(this.groupId);
    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament_group:ended', { groupId: this.groupId, standings });
    }
  }
```

- [x] **Step 2: Update `onPlayerEliminated` to call `rebalanceTables` and use `distributePrizes`**

The existing `onPlayerEliminated` method (lines ~106–149) needs two changes:
1. Update registration status to `'busted'`
2. Trigger `rebalanceTables()` check
3. Call `distributePrizes` instead of `_endGroup` when 1 player remains

Replace the existing `onPlayerEliminated` method:

```js
  async onPlayerEliminated(tableId, playerId, chipsAtElim) {
    // Count active players remaining across all tables
    const activeCount = await this._countActivePlayers();
    const position = activeCount + 1;

    try {
      await TournamentGroupRepository.recordElimination({
        groupId: this.groupId,
        playerId,
        position,
        chipsAtElim,
      });
    } catch (err) {
      // Non-fatal
    }

    // Update registration status to busted
    try {
      const { TournamentGroupRepository: Repo } = require('../../db/repositories/TournamentGroupRepository');
      await Repo.updateRegistrationStatus(this.groupId, playerId, 'busted');
    } catch (_) {
      // Non-fatal — registration may not exist (pre-registration tournaments)
    }

    // Notify all tables of the elimination
    for (const tid of this.tableIds) {
      this.io.to(tid).emit('tournament:elimination', {
        playerId,
        position,
        playerCount: activeCount,
        tableId,
      });
    }

    // Check if final table reached (one table has all remaining players)
    if (this.tableIds.length > 1) {
      const nonEmptyTables = await this._getNonEmptyTableIds();
      if (nonEmptyTables.length === 1) {
        for (const tid of this.tableIds) {
          this.io.to(tid).emit('tournament_group:final_table', {
            finalTableId: nonEmptyTables[0],
          });
        }
      }
    }

    // Check if entire tournament is over
    if (activeCount <= 1) {
      const winnerId = await this._findWinnerId();
      const standings = await this._buildFinalStandings(winnerId);
      await this.distributePrizes(standings);
      return;
    }

    // Trigger rebalancing if any table has ≤ 3 active players
    await this.rebalanceTables();
  }

  /**
   * Build finalStandings array ordered 1st…nth from DB standings.
   */
  async _buildFinalStandings(winnerId) {
    const standings = await TournamentGroupRepository.getStandings(this.groupId);
    const result = standings
      .filter(s => s.finish_position != null)
      .sort((a, b) => a.finish_position - b.finish_position)
      .map(s => ({ playerId: s.player_id, place: s.finish_position }));

    // Ensure winner is place 1 if not already recorded
    if (winnerId && !result.find(s => s.place === 1)) {
      result.unshift({ playerId: winnerId, place: 1 });
    }
    return result;
  }
```

Note: the old `_endGroup` method remains but is no longer called from `onPlayerEliminated`. Keep it — it may be called from the manual `/end` route.

- [x] **Step 3: Run controller tests**

```bash
cd c:\Users\user\poker-trainer && npx jest server/game/controllers/__tests__/controllers.test.js --no-coverage 2>&1 | tail -20
```

Expected: existing tests pass (no regressions). The new methods have no tests yet — they're covered in Task 6.

- [x] **Step 4: Commit**

```bash
git add server/game/controllers/TournamentGroupController.js
git commit -m "feat(controller): tournament group assignPlayersToTables, rebalanceTables, distributePrizes"
```

---

## Task 5: Tournament group routes — registration, lifecycle endpoints

**Files:**
- Modify: `server/routes/tournamentGroups.js`

- [x] **Step 1: Extend the existing `POST /api/tournament-groups` to accept new fields**

In `registerTournamentGroupRoutes`, replace the existing destructuring inside `POST /api/tournament-groups`:

```js
// BEFORE:
const {
  name,
  maxPlayers         = 18,
  maxPlayersPerTable = 9,
  minPlayersPerTable = 3,
  blindSchedule      = [],
  startingStack      = 10000,
  schoolId           = null,
} = req.body ?? {};

// AFTER:
const {
  name,
  maxPlayers         = 18,
  maxPlayersPerTable = 9,
  minPlayersPerTable = 3,
  blindSchedule      = [],
  startingStack      = 10000,
  schoolId           = null,
  buyIn              = 0,
  privacy            = 'public',
  scheduledAt        = null,
  payoutStructure    = [],
  lateRegEnabled     = false,
  lateRegMinutes     = 20,
} = req.body ?? {};
```

Also extend the `createGroup` call to pass the new fields:

```js
const groupId = await TournamentGroupRepository.createGroup({
  schoolId,
  name,
  sharedConfig:       { blind_schedule: blindSchedule, starting_stack: startingStack },
  maxPlayersPerTable,
  minPlayersPerTable,
  createdBy:          req.user?.stableId ?? req.user?.id,
  buyIn,
  privacy,
  scheduledAt,
  payoutStructure,
  lateRegEnabled,
  lateRegMinutes,
});
```

Also update `TournamentGroupRepository.createGroup` to pass these fields to the insert:

```js
// In TournamentGroupRepository.createGroup, extend the insert object:
async createGroup({ schoolId = null, name, sharedConfig = {}, maxPlayersPerTable = 9, minPlayersPerTable = 3, createdBy = null,
                    buyIn = 0, privacy = 'public', scheduledAt = null, payoutStructure = [], lateRegEnabled = false, lateRegMinutes = 20 }) {
  const { data, error } = await supabase
    .from('tournament_groups')
    .insert({
      school_id:              schoolId,
      name,
      shared_config:          sharedConfig,
      max_players_per_table:  maxPlayersPerTable,
      min_players_per_table:  minPlayersPerTable,
      created_by:             createdBy,
      status:                 'pending',
      buy_in:                 buyIn,
      privacy,
      scheduled_at:           scheduledAt ?? null,
      payout_structure:       payoutStructure,
      late_reg_enabled:       lateRegEnabled,
      late_reg_minutes:       lateRegMinutes,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
},
```

Also change the response to **not** create tables upfront (remove the table-creation loop from POST, since tables are now created at `PATCH start`). The POST response becomes:

```js
res.status(201).json({ groupId });
```

- [x] **Step 2: Add `GET /api/tournament-groups` list endpoint**

Add before the existing `GET /api/tournament-groups/:id` route:

```js
  // GET /api/tournament-groups — list all with optional ?status= and ?privacy= filters
  app.get('/api/tournament-groups', requireAuth, async (req, res) => {
    try {
      const { status, privacy, schoolId } = req.query;
      const groups = await TournamentGroupRepository.listGroups({
        status:   status   ?? null,
        privacy:  privacy  ?? null,
        schoolId: schoolId ?? null,
      });
      res.json({ groups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 3: Add `POST /api/tournament-groups/:id/register`**

Add after the GET list endpoint:

```js
  // POST /api/tournament-groups/:id/register — register player, debit chip bank
  app.post('/api/tournament-groups/:id/register', requireAuth, async (req, res) => {
    try {
      const groupId  = req.params.id;
      const playerId = req.user?.stableId ?? req.user?.id;
      if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Tournament not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Tournament is not open for registration' });

      // Check not already registered
      const existing = await TournamentGroupRepository.getRegistration(groupId, playerId);
      if (existing) return res.status(409).json({ error: 'Already registered' });

      const buyIn = group.buy_in ?? 0;

      // Deduct buy-in from chip bank if applicable
      if (buyIn > 0) {
        const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');
        try {
          await ChipBankRepository.applyTransaction({
            playerId,
            amount:    -buyIn,
            type:      'tournament_entry',
            tableId:   null,
            createdBy: null,
            notes:     `Tournament entry: ${group.name}`,
          });
        } catch (err) {
          if (err.message === 'insufficient_funds') {
            return res.status(402).json({ error: 'Insufficient chip bank balance' });
          }
          throw err;
        }
      }

      await TournamentGroupRepository.createRegistration(groupId, playerId, buyIn);

      // Notify all registered sockets of new entrant count
      const io = req.app.get('io');
      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      io.to(groupId).emit('tournament_group:registration_update', { groupId, count: registrations.length });

      res.status(201).json({ registered: true, buyIn });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 4: Add `DELETE /api/tournament-groups/:id/register`**

```js
  // DELETE /api/tournament-groups/:id/register — unregister (refund), pre-start only
  app.delete('/api/tournament-groups/:id/register', requireAuth, async (req, res) => {
    try {
      const groupId  = req.params.id;
      const playerId = req.user?.stableId ?? req.user?.id;
      if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Tournament not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Cannot unregister after tournament has started' });

      const registration = await TournamentGroupRepository.getRegistration(groupId, playerId);
      if (!registration) return res.status(404).json({ error: 'Not registered' });

      await TournamentGroupRepository.cancelRegistration(groupId, playerId);

      // Refund buy-in
      if (registration.buy_in_amount > 0) {
        const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');
        await ChipBankRepository.applyTransaction({
          playerId,
          amount:    registration.buy_in_amount,
          type:      'tournament_refund',
          tableId:   null,
          createdBy: null,
          notes:     `Tournament refund: ${group.name}`,
        });
      }

      res.json({ unregistered: true, refunded: registration.buy_in_amount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 5: Add `PATCH /api/tournament-groups/:id/start`**

Replace the existing `POST /api/tournament-groups/:id/start` handler with a `PATCH` (keep the POST for backward compat but add the PATCH as the canonical version):

```js
  // PATCH /api/tournament-groups/:id/start — assign players to tables, init TournamentControllers
  app.patch('/api/tournament-groups/:id/start', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group   = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Tournament is not pending' });

      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      if (registrations.length < 2) return res.status(400).json({ error: 'Need at least 2 registered players to start' });

      const io = req.app.get('io');
      const groupCtrl = new TournamentGroupController(groupId, io);
      groupCtrl.config = group;
      SharedState.groupControllers.set(groupId, groupCtrl);

      const sharedConfig = group.shared_config ?? {};
      const players = registrations.map(r => ({
        playerId: r.player_id,
        name:     r.player_profiles?.display_name ?? r.player_id,
      }));

      // Create tables and emit player_assigned to each player
      const tableIds = await groupCtrl.assignPlayersToTables(players, {
        blindSchedule:   sharedConfig.blind_schedule   ?? [],
        startingStack:   sharedConfig.starting_stack   ?? 10000,
        lateRegEnabled:  group.late_reg_enabled ?? false,
        lateRegMinutes:  group.late_reg_minutes ?? 0,
        payoutStructure: group.payout_structure ?? [],
      });

      // Start group controller (blind timer for all tables)
      await groupCtrl.start(sharedConfig, tableIds);

      // Mark registrations as seated
      for (const r of registrations) {
        await TournamentGroupRepository.updateRegistrationStatus(groupId, r.player_id, 'seated');
      }

      // Notify pre-joined sockets
      io.to(groupId).emit('tournament_group:started', { groupId, tableIds });

      res.json({ started: true, tableIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 6: Add `PATCH /api/tournament-groups/:id/cancel`**

```js
  // PATCH /api/tournament-groups/:id/cancel — cancel tournament; refund all registrations
  app.patch('/api/tournament-groups/:id/cancel', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group   = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (!['pending', 'running'].includes(group.status)) {
        return res.status(400).json({ error: 'Tournament cannot be cancelled in current state' });
      }

      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');

      // Refund all registered/seated players
      for (const r of registrations) {
        if (!['registered', 'seated'].includes(r.status)) continue;
        if ((r.buy_in_amount ?? 0) > 0) {
          try {
            await ChipBankRepository.applyTransaction({
              playerId:  r.player_id,
              amount:    r.buy_in_amount,
              type:      'tournament_refund',
              tableId:   null,
              createdBy: null,
              notes:     `Tournament cancelled: ${group.name}`,
            });
          } catch (_) { /* non-fatal */ }
        }
        await TournamentGroupRepository.updateRegistrationStatus(groupId, r.player_id, 'cancelled');
      }

      await TournamentGroupRepository.updateStatus(groupId, 'finished');

      // Destroy group controller if running
      const groupCtrl = SharedState.groupControllers.get(groupId);
      if (groupCtrl) {
        groupCtrl.destroy();
        SharedState.groupControllers.delete(groupId);
      }

      const io = req.app.get('io');
      const refundAmount = group.buy_in ?? 0;
      for (const r of registrations) {
        io.to(r.player_id).emit('tournament_group:cancelled', { groupId, refundAmount });
      }

      res.json({ cancelled: true, refundedCount: registrations.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 7: Add `POST /api/tournament-groups/:id/finalize`**

```js
  // POST /api/tournament-groups/:id/finalize — distribute prizes; close all tables
  app.post('/api/tournament-groups/:id/finalize', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const { finalStandings = [] } = req.body ?? {};

      const groupCtrl = SharedState.groupControllers.get(groupId);
      if (!groupCtrl) {
        // Controller not in memory — just update DB status
        await TournamentGroupRepository.updateStatus(groupId, 'finished');
        return res.json({ finalized: true });
      }

      if (finalStandings.length === 0) {
        // Auto-compute from DB standings
        const standings = await TournamentGroupRepository.getStandings(groupId);
        const computed = standings
          .filter(s => s.finish_position != null)
          .sort((a, b) => a.finish_position - b.finish_position)
          .map(s => ({ playerId: s.player_id, place: s.finish_position }));
        await groupCtrl.distributePrizes(computed);
      } else {
        await groupCtrl.distributePrizes(finalStandings);
      }

      res.json({ finalized: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 8: Add registrations to the GET /:id detail endpoint**

Replace the existing `GET /api/tournament-groups/:id` handler body:

```js
  app.get('/api/tournament-groups/:id', requireAuth, async (req, res) => {
    try {
      const group         = await TournamentGroupRepository.getGroup(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const tableIds      = await TournamentGroupRepository.getTableIds(req.params.id);
      const registrations = await TournamentGroupRepository.getRegistrations(req.params.id);
      res.json({ group, tableIds, registrations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [x] **Step 9: Commit routes changes**

```bash
git add server/routes/tournamentGroups.js server/db/repositories/TournamentGroupRepository.js
git commit -m "feat(api): tournament group registration, start, cancel, finalize endpoints"
```

---

## Task 6: Server tests for new tournament group endpoints

**Files:**
- Create: `server/routes/__tests__/tournamentGroups.test.js`

- [x] **Step 1: Write the test file**

```js
'use strict';

/**
 * Tournament Groups API — route-level tests.
 *
 * Mocks: TournamentGroupRepository, TournamentGroupController,
 *        ChipBankRepository, requirePermission, SharedState.
 */

jest.mock('../../db/repositories/TournamentGroupRepository', () => ({
  TournamentGroupRepository: {
    getGroup:                  jest.fn(),
    listGroups:                jest.fn(),
    createGroup:               jest.fn(),
    getTableIds:               jest.fn(),
    getRegistrations:          jest.fn(),
    getRegistration:           jest.fn(),
    createRegistration:        jest.fn(),
    cancelRegistration:        jest.fn(),
    updateRegistrationStatus:  jest.fn(),
    updateStatus:              jest.fn(),
    getStandings:              jest.fn(),
    getTotalPrizePool:         jest.fn(),
  },
}));

jest.mock('../../game/controllers/TournamentGroupController', () => ({
  TournamentGroupController: jest.fn().mockImplementation(() => ({
    config: null,
    assignPlayersToTables: jest.fn().mockResolvedValue(['table-1']),
    start:                 jest.fn().mockResolvedValue(undefined),
    distributePrizes:      jest.fn().mockResolvedValue(undefined),
    destroy:               jest.fn(),
  })),
}));

jest.mock('../../db/repositories/ChipBankRepository', () => ({
  ChipBankRepository: {
    applyTransaction: jest.fn().mockResolvedValue(10000),
  },
}));

const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => mockPermMiddleware),
}));

jest.mock('../../state/SharedState', () => ({
  groupControllers: new Map(),
  getOrCreateController: jest.fn(),
}));

const express  = require('express');
const request  = require('supertest');
const { TournamentGroupRepository } = require('../../db/repositories/TournamentGroupRepository');
const { TournamentGroupController } = require('../../game/controllers/TournamentGroupController');

function buildApp({ user = null } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  };
  app.set('io', { to: jest.fn(() => ({ emit: jest.fn() })), sockets: { sockets: new Map() } });
  const { registerTournamentGroupRoutes } = require('../../routes/tournamentGroups');
  registerTournamentGroupRoutes(app, { requireAuth });
  return app;
}

const COACH = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
const PLAYER = { stableId: 'player-uuid', id: 'player-uuid', role: 'coached_student' };

describe('GET /api/tournament-groups', () => {
  it('returns list of groups', async () => {
    TournamentGroupRepository.listGroups.mockResolvedValue([{ id: 'g1', name: 'T1', status: 'pending' }]);
    const res = await request(buildApp({ user: PLAYER })).get('/api/tournament-groups');
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(TournamentGroupRepository.listGroups).toHaveBeenCalledWith({ status: null, privacy: null, schoolId: null });
  });

  it('passes status and privacy filters', async () => {
    TournamentGroupRepository.listGroups.mockResolvedValue([]);
    await request(buildApp({ user: PLAYER })).get('/api/tournament-groups?status=pending&privacy=public');
    expect(TournamentGroupRepository.listGroups).toHaveBeenCalledWith({ status: 'pending', privacy: 'public', schoolId: null });
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/api/tournament-groups');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/tournament-groups/:id/register', () => {
  const GROUP = { id: 'g1', name: 'T1', status: 'pending', buy_in: 500 };

  beforeEach(() => {
    TournamentGroupRepository.getGroup.mockResolvedValue(GROUP);
    TournamentGroupRepository.getRegistration.mockResolvedValue(null);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-uuid');
    TournamentGroupRepository.getRegistrations.mockResolvedValue([{ player_id: PLAYER.stableId }]);
  });

  it('registers a player and debits chip bank', async () => {
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    const res = await request(buildApp({ user: PLAYER }))
      .post('/api/tournament-groups/g1/register');
    expect(res.status).toBe(201);
    expect(res.body.registered).toBe(true);
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -500, type: 'tournament_entry', playerId: PLAYER.stableId })
    );
    expect(TournamentGroupRepository.createRegistration).toHaveBeenCalledWith('g1', PLAYER.stableId, 500);
  });

  it('returns 409 when already registered', async () => {
    TournamentGroupRepository.getRegistration.mockResolvedValue({ id: 'r1', status: 'registered' });
    const res = await request(buildApp({ user: PLAYER }))
      .post('/api/tournament-groups/g1/register');
    expect(res.status).toBe(409);
  });

  it('returns 400 when tournament is not pending', async () => {
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...GROUP, status: 'running' });
    const res = await request(buildApp({ user: PLAYER }))
      .post('/api/tournament-groups/g1/register');
    expect(res.status).toBe(400);
  });

  it('returns 402 on insufficient funds', async () => {
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    ChipBankRepository.applyTransaction.mockRejectedValue(new Error('insufficient_funds'));
    const res = await request(buildApp({ user: PLAYER }))
      .post('/api/tournament-groups/g1/register');
    expect(res.status).toBe(402);
  });
});

describe('DELETE /api/tournament-groups/:id/register', () => {
  const GROUP = { id: 'g1', name: 'T1', status: 'pending', buy_in: 500 };
  const REG   = { id: 'r1', status: 'registered', buy_in_amount: 500 };

  beforeEach(() => {
    TournamentGroupRepository.getGroup.mockResolvedValue(GROUP);
    TournamentGroupRepository.getRegistration.mockResolvedValue(REG);
    TournamentGroupRepository.cancelRegistration.mockResolvedValue(undefined);
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    ChipBankRepository.applyTransaction.mockResolvedValue(10500);
  });

  it('unregisters player and refunds chip bank', async () => {
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    const res = await request(buildApp({ user: PLAYER }))
      .delete('/api/tournament-groups/g1/register');
    expect(res.status).toBe(200);
    expect(res.body.unregistered).toBe(true);
    expect(res.body.refunded).toBe(500);
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, type: 'tournament_refund', playerId: PLAYER.stableId })
    );
  });

  it('returns 400 when tournament has started', async () => {
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...GROUP, status: 'running' });
    const res = await request(buildApp({ user: PLAYER }))
      .delete('/api/tournament-groups/g1/register');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tournament-groups/:id/start', () => {
  const GROUP = {
    id: 'g1', name: 'T', status: 'pending',
    shared_config: { blind_schedule: [], starting_stack: 10000 },
    late_reg_enabled: false, late_reg_minutes: 20, payout_structure: [],
  };
  const REGS = [
    { player_id: 'p1', player_profiles: { display_name: 'Alice' }, status: 'registered', buy_in_amount: 0 },
    { player_id: 'p2', player_profiles: { display_name: 'Bob'   }, status: 'registered', buy_in_amount: 0 },
  ];

  beforeEach(() => {
    TournamentGroupRepository.getGroup.mockResolvedValue(GROUP);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(REGS);
    TournamentGroupRepository.updateRegistrationStatus.mockResolvedValue(undefined);
    TournamentGroupController.mockImplementation(() => ({
      config: null,
      assignPlayersToTables: jest.fn().mockResolvedValue(['table-1']),
      start:                 jest.fn().mockResolvedValue(undefined),
    }));
  });

  it('starts tournament and returns tableIds', async () => {
    const res = await request(buildApp({ user: COACH }))
      .patch('/api/tournament-groups/g1/start');
    expect(res.status).toBe(200);
    expect(res.body.started).toBe(true);
    expect(res.body.tableIds).toEqual(['table-1']);
  });

  it('returns 400 when fewer than 2 players registered', async () => {
    TournamentGroupRepository.getRegistrations.mockResolvedValue([REGS[0]]);
    const res = await request(buildApp({ user: COACH }))
      .patch('/api/tournament-groups/g1/start');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tournament-groups/:id/cancel', () => {
  const GROUP = { id: 'g1', name: 'T', status: 'pending', buy_in: 200 };
  const REGS  = [
    { player_id: 'p1', status: 'registered', buy_in_amount: 200 },
    { player_id: 'p2', status: 'registered', buy_in_amount: 200 },
  ];

  beforeEach(() => {
    TournamentGroupRepository.getGroup.mockResolvedValue(GROUP);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(REGS);
    TournamentGroupRepository.updateRegistrationStatus.mockResolvedValue(undefined);
    TournamentGroupRepository.updateStatus.mockResolvedValue(undefined);
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    ChipBankRepository.applyTransaction.mockResolvedValue(1000);
  });

  it('cancels tournament and refunds all players', async () => {
    const { ChipBankRepository } = require('../../db/repositories/ChipBankRepository');
    const res = await request(buildApp({ user: COACH }))
      .patch('/api/tournament-groups/g1/cancel');
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);
    expect(res.body.refundedCount).toBe(2);
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledTimes(2);
    expect(TournamentGroupRepository.updateStatus).toHaveBeenCalledWith('g1', 'finished');
  });
});
```

- [x] **Step 2: Run the tests**

```bash
cd c:\Users\user\poker-trainer && npx jest server/routes/__tests__/tournamentGroups.test.js --no-coverage 2>&1 | tail -30
```

Expected: all tests pass. Fix any failures before moving on.

- [x] **Step 3: Commit tests**

```bash
git add server/routes/__tests__/tournamentGroups.test.js
git commit -m "test(api): tournament group registration + lifecycle endpoint tests"
```

---

## Task 7: TournamentSetup wizard — redirect POST + add privacy/late-reg

**Files:**
- Modify: `client/src/pages/admin/TournamentSetup.jsx`

The existing wizard already has `buy_in` and `scheduledStartAt`. What's missing:
1. **Privacy** radio (public / school / private)
2. **Late registration** toggle + minutes input
3. **Change `handleCreate` to POST to `/api/tournament-groups`** instead of `/api/admin/tournaments`

- [x] **Step 1: Add privacy and lateReg state variables**

In `WizardModal`, after the existing `const [refPlayerId, setRefPlayerId] = useState('');` line, add:

```jsx
  // Step 0 additions — privacy and late registration
  const [privacy, setPrivacy]               = useState('public');
  const [lateRegEnabled, setLateRegEnabled] = useState(false);
  const [lateRegMinutes, setLateRegMinutes] = useState(20);
```

- [x] **Step 2: Add Privacy and Late Registration fields to Step 0**

In the `{step === 0 && (` block, after the `Scheduled Start Time` input block, add:

```jsx
              {/* Privacy */}
              <div className="mb-4">
                {sectionLabel('Visibility')}
                <div className="flex gap-3">
                  {['public', 'school', 'private'].map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: privacy === v ? '#d4af37' : '#8b949e' }}>
                      <input type="radio" name="privacy" value={v} checked={privacy === v} onChange={() => setPrivacy(v)}
                        style={{ accentColor: '#d4af37', cursor: 'pointer' }} />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Late Registration */}
              <div className="mb-4">
                {sectionLabel('Late Registration')}
                <label className="flex items-center gap-3 cursor-pointer mb-2" style={{ userSelect: 'none' }}>
                  <input type="checkbox" checked={lateRegEnabled} onChange={e => setLateRegEnabled(e.target.checked)}
                    style={{ accentColor: '#d4af37', width: 14, height: 14, cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: '#c9d1d9' }}>Allow late registration</span>
                </label>
                {lateRegEnabled && (
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 11, color: '#6e7681' }}>Window duration (minutes):</span>
                    <NumberInput value={lateRegMinutes} onChange={setLateRegMinutes} width={72} min={1} />
                  </div>
                )}
              </div>
```

- [x] **Step 3: Change `handleCreate` to POST to `/api/tournament-groups`**

Replace the `handleCreate` function body (the `apiFetch` call and `onCreated` call):

```jsx
  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const blindSchedule = levels.map((l, i) => ({
        level: i + 1,
        sb: l.sb,
        bb: l.bb,
        ante: l.ante,
        duration_minutes: l.durationMin,
      }));
      const payoutStructure = payouts.map(p => ({ place: p.place, percentage: p.percent }));

      const data = await apiFetch('/api/tournament-groups', {
        method: 'POST',
        body: JSON.stringify({
          name,
          blindSchedule,
          startingStack,
          buyIn,
          privacy,
          scheduledAt:    scheduledStartAt || null,
          lateRegEnabled,
          lateRegMinutes,
          payoutStructure,
          payoutMethod,
          showIcmOverlay,
          dealThreshold,
          minPlayers,
          refPlayerId: refPlayerId.trim() || null,
        }),
      });

      // Fire-and-forget: save blind structure as a named preset if requested
      if (saveAsPreset && newPresetName.trim() && levels.length > 0) {
        apiFetch('/api/blind-presets', {
          method: 'POST',
          body: JSON.stringify({ name: newPresetName.trim(), levels: blindSchedule }),
        }).catch(() => {});
      }

      // data = { groupId }
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Create failed');
    } finally {
      setSaving(false);
    }
  }
```

- [x] **Step 4: Update `handleTournamentCreated` in LobbyPage.jsx**

In `client/src/pages/LobbyPage.jsx`, find `handleTournamentCreated` (line ~779) and update it:

```jsx
  const handleTournamentCreated = useCallback(({ groupId }) => {
    setShowTournamentWizard(false);
    refreshTables();
    if (groupId) navigate(`/tournaments/${groupId}`);
  }, [navigate, refreshTables]);
```

- [x] **Step 5: Run client tests to confirm no regressions**

```bash
cd c:\Users\user\poker-trainer\client && npm test -- --run 2>&1 | tail -30
```

Expected: existing tests pass. The wizard tests (if any) may need to be updated to reflect the new POST target.

- [x] **Step 6: Commit**

```bash
git add client/src/pages/admin/TournamentSetup.jsx client/src/pages/LobbyPage.jsx
git commit -m "feat(wizard): redirect tournament creation to /api/tournament-groups; add privacy + late-reg"
```

---

## Task 8: App.jsx routes + SideNav Tournaments item

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/SideNav.jsx`

- [x] **Step 1: Add imports and routes to App.jsx**

At the top of App.jsx, add three imports (after the existing tournament imports on line ~43):

```jsx
import TournamentListPage   from './pages/TournamentListPage.jsx';
import TournamentDetailPage from './pages/TournamentDetailPage.jsx';
import TournamentControlPage from './pages/TournamentControlPage.jsx';
```

Inside the `<Route element={<AppLayout />}>` block (around line ~115), add:

```jsx
          {/* Tournaments */}
          <Route path="/tournaments"                       element={<TournamentListPage />} />
          <Route path="/tournaments/:groupId"              element={<TournamentDetailPage />} />
          <Route path="/tournaments/:groupId/control"      element={<TournamentControlPage />} />
```

- [x] **Step 2: Add Tournaments nav item to SideNav**

In `client/src/components/SideNav.jsx`, inside the `NAV_ITEMS` array, add after the `Lobby` item (after line ~16):

```jsx
  {
    icon: '🏆',
    label: 'Tournaments',
    path: '/tournaments',
    roles: ['coach', ...STUDENT_ROLES, 'admin', 'superadmin'],
  },
```

- [x] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/components/SideNav.jsx
git commit -m "feat(nav): add /tournaments routes and SideNav item"
```

---

## Task 9: TournamentListPage

**Files:**
- Create: `client/src/pages/TournamentListPage.jsx`

- [x] **Step 1: Write the component**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { WizardModal } from './admin/TournamentSetup.jsx';

const GOLD = '#d4af37';

const TABS = ['Upcoming', 'Active', 'Completed'];
const TAB_STATUSES = {
  Upcoming:  'pending',
  Active:    'running',
  Completed: 'finished',
};

const STATUS_COLORS = {
  pending:  '#93c5fd',
  running:  '#3fb950',
  paused:   '#e3b341',
  finished: '#6e7681',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? '#6e7681';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}55`, color,
    }}>
      {status}
    </span>
  );
}

function TournamentCard({ group, onClick }) {
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3' }}>{group.name}</div>
        <StatusBadge status={group.status} />
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-1" style={{ fontSize: 11, color: '#6e7681' }}>
        {group.buy_in > 0 && (
          <span>Buy-in: <strong style={{ color: GOLD }}>{group.buy_in.toLocaleString()} chips</strong></span>
        )}
        {group.buy_in === 0 && <span style={{ color: '#3fb950' }}>Free</span>}
        {scheduledAt && (
          <span>Starts: <strong style={{ color: '#c9d1d9' }}>{scheduledAt.toLocaleString()}</strong></span>
        )}
        <span style={{ textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        style={{
          marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${GOLD}55`, color: GOLD,
          textTransform: 'uppercase',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = `${GOLD}55`; }}
      >
        View
      </button>
    </div>
  );
}

export default function TournamentListPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]         = useState('Upcoming');
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const canCreate = hasPermission('tournament:manage') || user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin';

  const loadGroups = useCallback(async (tabName) => {
    setLoading(true);
    try {
      const status = TAB_STATUSES[tabName];
      const data = await apiFetch(`/api/tournament-groups?status=${status}`);
      setGroups(data.groups ?? []);
    } catch (_) {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(tab); }, [tab, loadGroups]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0ece3', letterSpacing: '-0.03em' }}>Tournaments</h1>
          <p style={{ fontSize: 12, color: '#6e7681', marginTop: 2 }}>Register, play, and track poker tournaments</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowWizard(true)}
            style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: GOLD, color: '#0d1117', border: 'none',
            }}
          >
            + Create Tournament
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: '1px solid #21262d', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 12, fontWeight: tab === t ? 700 : 500, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? GOLD : '#6e7681',
              borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: '#6e7681', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ color: '#6e7681', fontSize: 13, textAlign: 'center', padding: 40 }}>
          No {tab.toLowerCase()} tournaments.
          {canCreate && tab === 'Upcoming' && (
            <span
              style={{ color: GOLD, cursor: 'pointer', marginLeft: 6 }}
              onClick={() => setShowWizard(true)}
            >
              Create one →
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <TournamentCard key={g.id} group={g} onClick={() => navigate(`/tournaments/${g.id}`)} />
          ))}
        </div>
      )}

      {showWizard && (
        <WizardModal
          onClose={() => setShowWizard(false)}
          onCreated={({ groupId }) => {
            setShowWizard(false);
            navigate(`/tournaments/${groupId}`);
          }}
        />
      )}
    </div>
  );
}
```

- [x] **Step 2: Commit**

```bash
git add client/src/pages/TournamentListPage.jsx
git commit -m "feat(ui): TournamentListPage — three-tab list + create button"
```

---

## Task 10: TournamentDetailPage

**Files:**
- Create: `client/src/pages/TournamentDetailPage.jsx`

- [x] **Step 1: Write the component**

This reuses `BlindStructureSheet`, `EntrantsList`, `PayoutsTable`, `CountdownBar` from `TournamentLobby.jsx` — extract them by importing directly from that file (they are inner components). Since TournamentLobby.jsx doesn't export them, we'll reproduce the key ones inline.

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const GOLD = '#d4af37';

function StatusBadge({ status }) {
  const COLOR = { pending: '#93c5fd', running: '#3fb950', paused: '#e3b341', finished: '#6e7681' };
  const c = COLOR[status] ?? '#6e7681';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3, background: `${c}18`, border: `1px solid ${c}55`, color: c }}>
      {status}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #21262d' }}>
      <span style={{ fontSize: 11, color: '#6e7681' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f0ece3', fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  );
}

function BlindStructureSheet({ schedule }) {
  if (!schedule || schedule.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No blind schedule.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#6e7681' }}>
          {['Lvl', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.map((lvl, i) => (
          <tr key={i} style={{ color: '#c9d1d9' }}>
            <td style={{ padding: '4px 0', color: GOLD, fontWeight: 700 }}>{lvl.level}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.sb?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.bb?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.ante?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.duration_minutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RegistrantsList({ registrations }) {
  if (!registrations || registrations.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No registrations yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {registrations.map(r => (
        <div key={r.id} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: '#0d1117', borderRadius: 4, fontSize: 12, color: '#c9d1d9' }}>
          <span>{r.player_profiles?.display_name ?? r.player_id}</span>
          <span style={{ fontSize: 10, color: r.status === 'seated' ? '#3fb950' : '#6e7681', textTransform: 'uppercase', fontWeight: 700 }}>{r.status}</span>
        </div>
      ))}
    </div>
  );
}

function PayoutsTable({ payoutStructure, buyIn, registrationCount }) {
  if (!payoutStructure || payoutStructure.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No payout structure.</p>;
  const totalPool = buyIn * registrationCount;
  return (
    <div className="flex flex-col gap-1">
      {payoutStructure.map(tier => (
        <div key={tier.place} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: '#0d1117', borderRadius: 4, fontSize: 12, color: '#c9d1d9' }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>#{tier.place}</span>
          <span>{tier.percentage}%</span>
          {totalPool > 0 && (
            <span style={{ color: '#3fb950' }}>{Math.floor(totalPool * tier.percentage / 100).toLocaleString()} chips</span>
          )}
        </div>
      ))}
      {totalPool > 0 && (
        <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
          Prize pool: <strong style={{ color: GOLD }}>{totalPool.toLocaleString()} chips</strong>
        </div>
      )}
    </div>
  );
}

export default function TournamentDetailPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { user, hasPermission } = useAuth();

  const [group, setGroup]               = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [tableIds, setTableIds]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [actionBusy, setActionBusy]     = useState(false);
  const [error, setError]               = useState(null);

  const playerId = user?.stableId ?? user?.id;
  const isCoachOrAdmin = ['coach', 'admin', 'superadmin'].includes(user?.role);
  const canManage = hasPermission('tournament:manage') || isCoachOrAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/tournament-groups/${groupId}`);
      setGroup(data.group);
      setRegistrations(data.registrations ?? []);
      setTableIds(data.tableIds ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const isRegistered = registrations.some(r => r.player_id === playerId && r.status !== 'cancelled');
  const myReg = registrations.find(r => r.player_id === playerId && r.status !== 'cancelled');
  const myTableId = myReg?.status === 'seated' ? tableIds[0] : null; // simplified; group assigns table via socket

  async function handleRegister() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnregister() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStart() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/start`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setActionBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#6e7681', padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group) return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Tournament not found.</div>;

  const schedule = group.shared_config?.blind_schedule ?? [];
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;

  const btnStyle = (primary = false) => ({
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 18px', borderRadius: 6, cursor: actionBusy ? 'not-allowed' : 'pointer',
    opacity: actionBusy ? 0.6 : 1,
    background: primary ? GOLD : 'none',
    color: primary ? '#0d1117' : GOLD,
    border: primary ? 'none' : `1px solid ${GOLD}55`,
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate('/tournaments')}
        style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 12, marginBottom: 16, padding: 0 }}>
        ← Back to Tournaments
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0ece3', marginBottom: 4 }}>{group.name}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={group.status} />
            {scheduledAt && <span style={{ fontSize: 11, color: '#6e7681' }}>{scheduledAt.toLocaleString()}</span>}
            <span style={{ fontSize: 11, color: '#6e7681', textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap justify-end">
          {group.status === 'pending' && !isRegistered && (
            <button style={btnStyle(true)} onClick={handleRegister} disabled={actionBusy}>
              Register{group.buy_in > 0 ? ` (${group.buy_in.toLocaleString()} chips)` : ' (Free)'}
            </button>
          )}
          {group.status === 'pending' && isRegistered && (
            <button style={btnStyle()} onClick={handleUnregister} disabled={actionBusy}>Unregister</button>
          )}
          {group.status === 'running' && myReg?.status === 'seated' && tableIds.length > 0 && (
            <button style={btnStyle(true)} onClick={() => navigate(`/table/${tableIds[0]}`)}>Join Table</button>
          )}
          {canManage && group.status === 'pending' && (
            <button style={btnStyle(true)} onClick={handleStart} disabled={actionBusy}>Start Tournament</button>
          )}
          {canManage && ['pending', 'running'].includes(group.status) && (
            <button style={{ ...btnStyle(), color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }} onClick={handleCancel} disabled={actionBusy}>Cancel</button>
          )}
          {canManage && (
            <button style={btnStyle()} onClick={() => navigate(`/tournaments/${groupId}/control`)}>Control View</button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* Info grid */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
        <InfoRow label="Starting Stack" value={(group.shared_config?.starting_stack ?? 0).toLocaleString() + ' chips'} />
        <InfoRow label="Buy-In" value={group.buy_in > 0 ? `${group.buy_in.toLocaleString()} chips` : 'Free'} />
        <InfoRow label="Registrations" value={`${registrations.filter(r => r.status !== 'cancelled').length} players`} />
        {group.late_reg_enabled && <InfoRow label="Late Registration" value={`${group.late_reg_minutes} minutes after start`} />}
      </div>

      {/* Three columns: blind structure, registrants, payouts */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Blind Structure</h3>
          <BlindStructureSheet schedule={schedule} />
        </section>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Registrants</h3>
          <RegistrantsList registrations={registrations.filter(r => r.status !== 'cancelled')} />
        </section>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Payouts</h3>
          <PayoutsTable
            payoutStructure={group.payout_structure ?? []}
            buyIn={group.buy_in ?? 0}
            registrationCount={registrations.filter(r => r.status !== 'cancelled').length}
          />
        </section>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Commit**

```bash
git add client/src/pages/TournamentDetailPage.jsx
git commit -m "feat(ui): TournamentDetailPage — register, unregister, start, control buttons"
```

---

## Task 11: TournamentControlPage

**Files:**
- Create: `client/src/pages/TournamentControlPage.jsx`

- [x] **Step 1: Write the component**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

// Note: This file is in pages/ not pages/admin/ to follow the /tournaments/:groupId/control route.
// Move import paths accordingly.

const GOLD = '#d4af37';

function TableMiniCard({ tableId, tableIndex, onNavigate }) {
  return (
    <div
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s',
        minWidth: 180,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${GOLD}55`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; }}
      onClick={() => onNavigate(tableId)}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#f0ece3', marginBottom: 6 }}>
        Table {tableIndex + 1}
      </div>
      <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 4, wordBreak: 'break-all' }}>
        {tableId}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onNavigate(tableId); }}
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${GOLD}55`, color: GOLD,
          marginTop: 4,
        }}
      >
        Open
      </button>
    </div>
  );
}

export default function TournamentControlPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { hasPermission, user } = useAuth();

  const [group, setGroup]         = useState(null);
  const [tableIds, setTableIds]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [message, setMessage]     = useState(null);

  const canManage = hasPermission('tournament:manage') || ['coach','admin','superadmin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/tournament-groups/${groupId}`);
      setGroup(data.group);
      setTableIds(data.tableIds ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  async function handleFinalize() {
    if (!window.confirm('Finalize this tournament? Prizes will be distributed and it cannot be undone.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/finalize`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Tournament finalized. Prizes distributed.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' });
      setMessage('Tournament cancelled.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#6e7681', padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group)  return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Tournament not found.</div>;
  if (!canManage) return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Access denied.</div>;

  const btnStyle = (danger = false) => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '7px 16px', borderRadius: 5, cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    background: danger ? 'rgba(248,81,73,0.12)' : 'none',
    color: danger ? '#f85149' : GOLD,
    border: danger ? '1px solid rgba(248,81,73,0.35)' : `1px solid ${GOLD}55`,
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate(`/tournaments/${groupId}`)}
        style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 12, marginBottom: 16, padding: 0 }}>
        ← Back to Tournament
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f0ece3' }}>{group.name} — Control</h1>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 2 }}>Status: {group.status} · {tableIds.length} table(s)</p>
        </div>

        {/* Global controls */}
        <div className="flex gap-2 flex-wrap">
          {group.status === 'running' && (
            <button style={btnStyle()} onClick={handleFinalize} disabled={busy}>End & Finalize</button>
          )}
          {['pending', 'running'].includes(group.status) && (
            <button style={btnStyle(true)} onClick={handleCancel} disabled={busy}>Cancel Tournament</button>
          )}
        </div>
      </div>

      {error   && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#3fb950', fontSize: 12, marginBottom: 12 }}>{message}</div>}

      {/* Table grid */}
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 12 }}>
        Active Tables
      </h2>
      {tableIds.length === 0 ? (
        <p style={{ color: '#6e7681', fontSize: 13 }}>No tables yet — tournament has not started.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tableIds.map((tableId, i) => (
            <TableMiniCard
              key={tableId}
              tableId={tableId}
              tableIndex={i}
              onNavigate={tid => navigate(`/table/${tid}`)}
            />
          ))}
        </div>
      )}

      {/* Standings link */}
      {group.status === 'finished' && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => navigate(`/tournament-group/${groupId}/lobby`)}
            style={{ fontSize: 12, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            View Final Standings →
          </button>
        </div>
      )}
    </div>
  );
}
```

> **Note:** This file lives at `client/src/pages/TournamentControlPage.jsx`. The imports for `apiFetch` and `useAuth` use relative paths from `pages/`, not `pages/admin/`.

- [x] **Step 2: Commit**

```bash
git add client/src/pages/TournamentControlPage.jsx
git commit -m "feat(ui): TournamentControlPage — multi-table grid + global controls"
```

---

## Task 12: LobbyPage — upcoming tournaments strip

**Files:**
- Modify: `client/src/pages/LobbyPage.jsx`

- [x] **Step 1: Add upcoming tournaments state and fetch**

In `LobbyPage.jsx`, add state for upcoming tournaments. Find the existing state declarations (around line ~65+) and add:

```jsx
const [upcomingTournaments, setUpcomingTournaments] = useState([]);
```

Find the `useEffect` that fetches tables (or the initial data fetch) and add a parallel fetch for tournaments. Look for the primary data-loading `useEffect` that calls the tables API, and after it add a separate non-blocking effect:

```jsx
// Fetch upcoming public tournaments for the lobby strip (non-blocking)
useEffect(() => {
  apiFetch('/api/tournament-groups?status=pending&privacy=public')
    .then(data => setUpcomingTournaments((data.groups ?? []).slice(0, 3)))
    .catch(() => {}); // non-blocking — lobby still works if this fails
}, []);
```

- [x] **Step 2: Add the strip component below the table list**

In the LobbyPage JSX, find where the main table list ends. Add the strip immediately after the closing tag of the tables section and before the footer / closing tag of the main container:

```jsx
{/* ── Upcoming Tournaments Strip ── */}
{upcomingTournaments.length > 0 && (
  <div style={{ marginTop: 28 }}>
    <div className="flex items-center justify-between mb-3">
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase' }}>
        Upcoming Tournaments
      </span>
      <button
        onClick={() => navigate('/tournaments')}
        style={{ fontSize: 11, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
      >
        View All →
      </button>
    </div>
    <div className="flex gap-3 overflow-x-auto pb-2">
      {upcomingTournaments.map(t => {
        const scheduledAt = t.scheduled_at ? new Date(t.scheduled_at) : null;
        const minutesUntil = scheduledAt ? Math.round((scheduledAt - Date.now()) / 60000) : null;
        const showCountdown = minutesUntil !== null && minutesUntil >= 0 && minutesUntil <= 10;
        return (
          <div
            key={t.id}
            onClick={() => navigate(`/tournaments/${t.id}`)}
            style={{
              background: '#161b22', border: `1px solid ${showCountdown ? GOLD : '#30363d'}`,
              borderRadius: 8, padding: '12px 14px', cursor: 'pointer', flexShrink: 0,
              minWidth: 200, maxWidth: 220, transition: 'all 0.12s',
              boxShadow: showCountdown ? `0 0 10px rgba(212,175,55,0.15)` : 'none',
            }}
            onMouseEnter={e => { if (!showCountdown) e.currentTarget.style.borderColor = `${GOLD}55`; }}
            onMouseLeave={e => { if (!showCountdown) e.currentTarget.style.borderColor = '#30363d'; }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f0ece3', marginBottom: 4 }}>{t.name}</div>
            {scheduledAt && (
              <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 4 }}>
                {scheduledAt.toLocaleString()}
              </div>
            )}
            {showCountdown && (
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 4 }}>
                Starts in {minutesUntil} min
              </div>
            )}
            <div style={{ fontSize: 11, color: '#6e7681' }}>
              {t.buy_in > 0 ? `${t.buy_in.toLocaleString()} chips` : 'Free'}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [x] **Step 3: Run client tests**

```bash
cd c:\Users\user\poker-trainer\client && npm test -- --run 2>&1 | tail -20
```

Expected: all tests pass.

- [x] **Step 4: Commit**

```bash
git add client/src/pages/LobbyPage.jsx
git commit -m "feat(lobby): upcoming tournaments strip with countdown badge"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Batch 0 fixes (C-1, C-14, C-15, C-16, C-17) | Pre-flight — already done |
| Migration 047: extend tournament_groups | Task 1 |
| Migration 048: tournament_group_registrations | Task 2 |
| Chip bank: tournament_entry, tournament_refund, tournament_prize | Task 1 (enum extension) |
| assignPlayersToTables (ceil(n/7), round-robin) | Task 4 |
| rebalanceTables (≤3 trigger, stop at final table) | Task 4 |
| onPlayerEliminated updates registration status + triggers rebalance | Task 4 |
| distributePrizes (payout_structure × total pool, ChipBankRepository) | Task 4 |
| tournament_group:player_assigned socket event | Task 4 (assignPlayersToTables) |
| tournament_group:rebalance socket event | Task 4 (rebalanceTables) |
| tournament_group:prize_awarded socket event | Task 4 (distributePrizes) |
| tournament_group:cancelled socket event | Task 5 (cancel endpoint) |
| POST /api/tournament-groups — extend with new fields | Task 5, Step 1 |
| GET /api/tournament-groups — list with ?status= and ?privacy= | Task 5, Step 2 |
| POST /api/tournament-groups/:id/register | Task 5, Step 3 |
| DELETE /api/tournament-groups/:id/register | Task 5, Step 4 |
| PATCH /api/tournament-groups/:id/start | Task 5, Step 5 |
| PATCH /api/tournament-groups/:id/cancel | Task 5, Step 6 |
| POST /api/tournament-groups/:id/finalize | Task 5, Step 7 |
| Server tests for new endpoints | Task 6 |
| TournamentSetup: add privacy + late-reg fields | Task 7 |
| TournamentSetup: change POST target to /api/tournament-groups | Task 7 |
| App.jsx: /tournaments, /tournaments/:groupId, /tournaments/:groupId/control routes | Task 8 |
| SideNav: Tournaments item between Lobby and Leaderboard | Task 8 |
| TournamentListPage: three tabs + Create button | Task 9 |
| TournamentDetailPage: register/unregister/start/cancel/join buttons | Task 10 |
| TournamentDetailPage: blind structure + registrants + payouts sections | Task 10 |
| TournamentControlPage: multi-table grid + global controls | Task 11 |
| LobbyPage: upcoming tournaments strip (3 cards, countdown, View All) | Task 12 |

**Gap**: `tournament_group:starting_soon` (10-min warning broadcast) — spec says server emits this when `< 10 min to scheduled start`. This would require a scheduled job or a timer when a tournament is created with `scheduled_at`. **Deferred** — the spec lists it as a socket event but doesn't specify the triggering mechanism beyond "10-min warning broadcast". A simple `setTimeout` at group creation time when `scheduled_at` is set would implement it; add to a future task.

**Gap**: Referee delegation from TournamentDetailPage — spec says "tournament opener can assign referee role to registered players". This would use the existing `/api/tournament-referees` endpoint. Deferred as it requires additional UI work not critical to the baseline.

All other spec requirements are covered. No placeholder steps remain.
