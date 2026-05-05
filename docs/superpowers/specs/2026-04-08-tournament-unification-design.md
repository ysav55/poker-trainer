# Tournament System Unification — Design Spec

> **Status:** Approved. Ready for implementation planning.
> **Date:** 2026-04-08
> **Branch:** feat/phase2
> **Flows covered:** Flow 8 (Coach-Run Tournament), Flow 9 (Organised Tournament)

---

## Summary

All tournaments — single-table or multi-table — are unified under `TournamentGroupController` as the single orchestrator. A single-table tournament is a group with one table. `TournamentController` (extends `AutoController`) remains the per-table game engine and is unchanged except for Phase 2 bug fixes. The old standalone System A routes (`POST /api/tournaments`, standalone `TournamentRepository` create/register) are deprecated in favour of the group system.

**Design philosophy:** Reuse and extend what exists. Tables look and behave like cash-game tables — same UI, same socket events. No rebuilding where avoidable. Goal is a working baseline.

---

## Architecture

```
TournamentGroupController  (orchestrator — one per tournament)
  ├── manages shared blind schedule across all tables
  ├── assigns players to tables at start
  ├── handles rebalancing as players bust
  ├── distributes prizes at end
  └── delegates per-table game logic to:
       TournamentController[table-1]  →  GameManager
       TournamentController[table-2]  →  GameManager
       ...
```

A 1-table tournament is `ceil(n/7) = 1` — the same code path as an 18-player 3-table event.

---

## Batch 0 — Tournament-Specific Phase 2 Fixes (Prerequisites)

These ship first. Nothing works without them.

| Ref | File | Fix |
|-----|------|-----|
| C-14 | `supabase/migrations/046_fix_tournament_referees_constraint.sql` | Drop bad `UNIQUE NULLS NOT DISTINCT` constraint on `tournament_referees`; replace with partial unique index `WHERE active = true` |
| C-1 | `server/auth/tournamentAuth.js` | `const query` → `let query`; reassign `.eq('table_id', tableId)` result so referee scope filter is not silently dropped |
| C-15 | `server/socket/handlers/betting.js` | Extend auto-complete mode check from `=== 'uncoached_cash'` to `['uncoached_cash', 'tournament'].includes(ctrl?.getMode?.())` — fixes hands freezing at showdown |
| C-16 | `server/game/controllers/TournamentController.js` | Replace `this.gm.startGame()` with `this._startHand()` in `start()` — fixes first hand never being logged to DB |
| C-17 | `server/socket/handlers/tournament.js` | Fix `toGm.addPlayer({ id, name, seat, stack })` → `toGm.addPlayer(playerId, name, false, playerId, stack)` — fixes moved player state corruption |

---

## Data Model

### Migration 047 — Extend `tournament_groups`

```sql
ALTER TABLE tournament_groups
  ADD COLUMN buy_in             INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN privacy            TEXT         NOT NULL DEFAULT 'public'
                                CHECK (privacy IN ('public', 'school', 'private')),
  ADD COLUMN scheduled_at       TIMESTAMPTZ,
  ADD COLUMN payout_structure   JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN late_reg_enabled   BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN late_reg_minutes   INTEGER      NOT NULL DEFAULT 20;
```

### Migration 048 — `tournament_group_registrations`

```sql
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
```

### Chip bank integration

- **Registration** → `ChipBankRepository.deductBalance(playerId, buyIn)` + one `chip_bank_transactions` row (type: `tournament_entry`)
- **Cancellation / unregister (pre-start)** → reversal transaction (type: `tournament_refund`)
- **Prize distribution (on finalize)** → `ChipBankRepository.creditBalance(playerId, amount)` per winner (type: `tournament_prize`)
- No schema changes to chip bank — existing columns handle all three cases.

---

## Table Balancing Algorithm

```
numTables = ceil(registeredPlayers / 7)

Examples:
  15 players → 3 tables  (5 each)
  18 players → 3 tables  (6 each)
  22 players → 4 tables  (5–6 each)

Assignment: round-robin fill across tables.

Rebalance trigger (during play):
  - Any table drops to ≤ 3 active players
  - Move player from largest table to smallest
  - If that empties a table → remove it, reassign remaining players

Late registration rule (when late_reg_enabled = true):
  - New registrants fill existing tables up to 8 seats
  - When all tables are at 8 → rebalance + open new table
  - Late-reg window = late_reg_minutes after tournament start
```

---

## Server Changes

### New / Extended REST Endpoints

All require `requireAuth`. Create/manage endpoints require `requirePermission('tournament:manage')`. Registration requires only `requireAuth`.

```
POST   /api/tournament-groups                     — create tournament (extend: add buy_in, privacy,
                                                    scheduled_at, payout_structure, late_reg fields)
GET    /api/tournament-groups                     — list all (add ?status= and ?privacy=public filter)
GET    /api/tournament-groups/:id                 — detail + registered players + current level
POST   /api/tournament-groups/:id/register        — register player; debit chip bank
DELETE /api/tournament-groups/:id/register        — unregister (refund); pre-start only
PATCH  /api/tournament-groups/:id/start           — assign players to tables, init TournamentControllers
PATCH  /api/tournament-groups/:id/cancel          — cancel tournament; refund all registrations
POST   /api/tournament-groups/:id/finalize        — distribute prizes; close all tables
```

### `TournamentGroupController` — New Methods

```js
/**
 * Calculate table count and assign players round-robin.
 * Emits tournament_group:player_assigned to each player with their tableId + seat.
 */
assignPlayersToTables(players: Array<{ playerId, name }>): void

/**
 * Move one player from the largest table to the smallest.
 * Called when any table drops to ≤ 3 active players.
 * Emits tournament_group:rebalance to the moved player.
 * Stops rebalancing when only 1 table remains (final table) — that is the
 * natural tournament end state and tables should NOT be merged further.
 */
rebalanceTables(): void

/**
 * Called by each TournamentController when a player busts.
 * Updates registration status = 'busted'. Triggers rebalanceTables() check.
 * If only 1 player remains across all tables → calls distributePrizes() automatically.
 */
onPlayerEliminated(tableId: string, playerId: string): void

/**
 * Calculate prizes from payout_structure percentages × total prize pool.
 * Total prize pool = sum of all buy_in_amount from registrations with status != 'cancelled'.
 * Calls ChipBankRepository.creditBalance() for each winner.
 * Emits tournament_group:prize_awarded to each winner.
 * Marks all tables completed. Updates tournament_groups.status = 'finished'.
 */
distributePrizes(finalStandings: Array<{ playerId, place }>): Promise<void>
```

### New Socket Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `tournament_group:player_assigned` | server → player | `{ groupId, tableId, seat }` | Player knows which table to navigate to |
| `tournament_group:rebalance` | server → moved player | `{ newTableId, newSeat }` | Player auto-navigates to new table |
| `tournament_group:prize_awarded` | server → winner | `{ amount, place, newBalance }` | Toast notification on prize credit |
| `tournament_group:cancelled` | server → all registered | `{ groupId, refundAmount }` | Notify all players of cancellation + refund |
| `tournament_group:starting_soon` | server → all registered | `{ groupId, minutesUntilStart }` | 10-min warning broadcast |

---

## Client Changes

### New Routes (App.jsx + SideNav)

```
/tournaments                      — TournamentListPage (new)
/tournaments/:groupId             — TournamentDetailPage (new, uses existing sub-components)
/tournaments/:groupId/control     — TournamentControlPage (extends RefereeDashboard)
```

SideNav: add **Tournaments** item between Lobby and Leaderboard.

### `LobbyPage.jsx` — Upcoming Tournaments Strip

- Below the table list: horizontal row of up to 3 upcoming tournament cards
- Card shows: name, scheduled time, buy-in, registered/max count
- Countdown badge (gold) when < 10 min to scheduled start
- **View All →** links to `/tournaments`
- Data from `GET /api/tournament-groups?status=pending&privacy=public` on lobby load (parallel to existing tables fetch, non-blocking)

### `TournamentListPage.jsx` (new, ~200 lines)

- Three tabs: **Upcoming** / **Active** / **Completed**
- Each card: name, date/time, buy-in, registered count, status badge, **View** button
- **Create Tournament** button (coach/admin only) → opens `TournamentSetup` wizard modal
- `TournamentSetup.jsx` is pulled out of the admin panel and made invokable from here (no duplication — just change the import path and add a prop to open it as a modal)

### `TournamentDetailPage.jsx` (new, ~250 lines)

Reuses existing sub-components from `TournamentLobby.jsx`:
- `BlindStructureSheet`, `EntrantsList`, `PayoutsTable`, `CountdownBar`

New additions:
- **Register button** → confirmation modal: shows player's current chip bank balance, buy-in amount, confirm/cancel
- **Rebuy button** (if tournament allows, player is busted and rebuy window open)
- **Join Table button** (shown when tournament is running and player has an assigned table) → `navigate('/table/:tableId')`
- **Open Control View button** (coach/admin/referee only) → `/tournaments/:groupId/control`
- Handles `tournament_group:rebalance` socket event → toast + auto-navigate

### `TournamentControlPage.jsx` (extends `RefereeDashboard.jsx`)

- Multi-table grid: each table as a mini card showing player list, stack sizes, pot size, blind level indicator
- Reuses `TournamentBalancer.jsx` for move-player UI (already exists)
- Global controls bar: **Pause All / Resume**, **Advance Blind Level**, **End Tournament**
- Click any table card → expands or navigates to `/table/:tableId` with coach/spectator mode (god-view: sees all hole cards)
- Referee delegation: tournament opener can assign referee role to registered players (admin → any player, coach → own coached_students)

### `TournamentSetup.jsx` — Extended Wizard Steps

Add to the existing step flow:

1. **Buy-in** — integer input (chips); shown with "Players will be charged from their chip bank at registration"
2. **Privacy** — public / school / private (same radio pattern as table privacy)
3. **Scheduled start** — datetime picker (optional; blank = manual start only)
4. **Late registration** — toggle + minutes input (default 20 min)
5. **Payout structure** — already exists in the wizard; ensure it is wired through to POST body

POST body extended with: `buy_in`, `privacy`, `scheduledAt`, `lateRegEnabled`, `lateRegMinutes`, `payoutStructure`.

### In-Table Experience (no new components)

Players navigate to `/table/:tableId` — same table UI as cash game. Existing tournament components already handle the in-table experience:
- `TournamentTopBar.jsx` — blind level + time remaining
- `TournamentSidebar.jsx` — standings + level info

On `tournament_group:rebalance` event: toast notification ("You are being moved to Table 2") + auto-navigate after 3 seconds.

---

## Out of Scope (defer to P2 or later)

- C-8, C-9, C-7 (socket stale ref, isCoach flag, leaveRoom logout) — go into P2 plan
- C-2, C-3 (permissions endpoint, audit trail) — P2 plan
- C-4, C-6 (AlertService scoping, BaselineService 3-bet) — P2 plan
- C-10, C-5, C-13 (StableOverviewPage mock data, settings auth, UserManagement JWT decode) — P2 plan
- ICM calculator / payout optimisation
- Staking system integration with tournament prizes
- Live video / streaming integration
- Student notification when moved between tables (email/push) — in-app toast is sufficient for baseline
