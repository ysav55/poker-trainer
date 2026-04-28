# Settings Phase 2 — Runtime Wiring

**Date:** 2026-04-16  
**Depends on:** Phase 1 spec (`2026-04-16-settings-cascade-redesign.md`) — cascade resolvers and blind structure endpoints must exist first.  
**Status:** Approved design, pending implementation plan.

---

## Problem

Phase 1 wires the settings UI cascade. Phase 2 makes those settings actually affect runtime behavior across four surfaces: leaderboard sorting, table creation, staking contract defaults, and platform enforcement limits.

---

## 1. Leaderboard Wiring

**What changes:** LeaderboardPage reads the cascaded leaderboard config and uses it for sort order and score column.

### Backend
`GET /api/players` — extend response to include `leaderboardConfig`:
```js
// server calls resolveLeaderboardConfig(req.user.schoolId) from SettingsService (Phase 1)
{ players: [...], leaderboardConfig: { value: { primary_metric, secondary_metric, update_frequency }, source } }
```

### Frontend (`LeaderboardPage.jsx`)
- Read `leaderboardConfig` from the `/api/players` response
- Sort `filtered` memo by `primary_metric` instead of hardcoded `total_net_chips`
- Score column title + formula uses `secondary_metric`

**Metric → field mapping:**

| Config value | Sort/compute field |
|---|---|
| `net_chips` | `total_net_chips` |
| `hands_played` | `total_hands` |
| `win_rate` | `total_wins / total_hands` |
| `bb_per_100` | `total_net_chips / total_hands * 100` |

`update_frequency` — stored, not acted on in Phase 2 (no scheduler exists).

### Files
- `server/routes/players.js` — add `leaderboardConfig` to response
- `server/services/SettingsService.js` — `resolveLeaderboardConfig` (Phase 1 adds this)
- `client/src/pages/LeaderboardPage.jsx` — consume config, dynamic sort + score

---

## 2. Blind Structures in Table Creation

### Schema change
Blind structure preset shape gains `max_players`. SB is always `bb / 2` — never stored or input separately.

```js
{ id, label, bb, max_players }  // sb = bb / 2, computed
```

Update Phase 1 endpoints accordingly:
- `POST /api/settings/school/blind-structures` body: `{ label, bb, max_players }`
- `POST /api/admin/org-settings/blind-structures` body: `{ label, bb, max_players }`

### CreateTableModal changes (`client/src/components/tables/CreateTableModal.jsx`)

**Remove** SB input. **Keep** BB input only — SB sent to server as `bb / 2`.

**Add** `max_players` select: options `2 (Heads-Up) / 6 (6-Max) / 8 (8-Handed) / 9 (Full Ring)`. Default: 9.

**Unified preset dropdown** replaces existing "Load Preset" select:
```
─ My Presets ─────────────
  6-Max NL50
─ School Blinds ──────────
  NL50 — BB 50, 6-Max
  NL100 — BB 100, 9-Max
─ Platform Blinds ─────────
  Micro — BB 10
  Low — BB 20
```
- Fetches `GET /api/settings/school/blind-structures` (merged, source-tagged, Phase 1)
- Also fetches `GET /api/table-presets` (existing personal presets)
- Selecting a **blind structure** preset: populates `bb` + `max_players` only
- Selecting a **personal preset**: populates full config (sb, bb, stack, etc.) as before
- Personal presets continue to save/load via existing endpoints

### GameManager changes (`server/game/GameManager.js`)

Add `max_players` to game state, respected by seat assignment:

```js
// _initState: clamp to valid range, never exceed 9
this.state.max_players = Math.min(config.max_players ?? 9, 9);

// _nextAvailableSeat: respect max_players
for (let i = 0; i < this.state.max_players; i++) { ... }

// _nextAvailableSeatForCoach: start from max_players - 1
for (let i = this.state.max_players - 1; i >= 0; i--) { ... }
```

**Why `Math.min(..., 9)`:** seat numbers must stay within 0–8. `positions.js` builds position maps from `seated.length` (not from `max_players`) so position logic is unaffected — but seat numbers out of range would corrupt any DB hand record that later tries to rebuild a seated array.

**ReplayEngine is safe:** it operates directly on `state` by reference and never calls `addPlayer` or `_nextAvailableSeat`. `max_players` in state is invisible to replay/scenario loading.

GameManager init already receives table config in `AutoController` and `CoachedController` — pass `max_players` from `tableConfig.config`.

### AutoController bug fix (`server/game/controllers/AutoController.js`)

```js
// BEFORE (broken — method does not exist, silently ignored)
this.gm.setBlinds?.(cfg.sb, cfg.bb);

// AFTER
this.gm.setBlindLevels?.(cfg.sb, cfg.bb);
```

### Files
- `server/routes/settings.js` — update blind structure schema (add `max_players`, drop `sb`)
- `server/routes/admin/orgSettings.js` — same schema update for org blind structures
- `server/game/GameManager.js` — `max_players` in state + seat iteration limits
- `server/game/controllers/AutoController.js` — fix `setBlinds` → `setBlindLevels`; pass `max_players`
- `client/src/components/tables/CreateTableModal.jsx` — remove SB input, add max_players select, unified preset dropdown

---

## 3. Staking Defaults Pre-fill

**What changes:** `ContractModal` pre-fills from school staking defaults when opening for a new contract.

### Frontend only (`client/src/pages/admin/StakingPage.jsx`)

`ContractModal` on mount (new contract path only):
1. Fetch `GET /api/settings/school` — read `staking_defaults.value`
2. Pre-fill:
   - `coach_split_pct` ← `staking_defaults.coach_split_pct` (fallback: 50)
   - `makeup_policy` ← `staking_defaults.makeup_policy` (fallback: `'carries'`)
   - `bankroll_cap` ← `staking_defaults.bankroll_cap` (fallback: empty)
   - `end_date` ← `start_date + contract_duration_months` months (fallback: empty/open-ended)
3. Pre-fill only when editing an existing contract (`contract` prop is not null): skip — show the contract's actual saved values.

No backend changes needed — `GET /api/settings/school` already returns `staking_defaults`.

### Files
- `client/src/pages/admin/StakingPage.jsx` — fetch school settings on ContractModal mount, pre-fill fields

---

## 4. Platform Limits Enforcement

### A. `max_tables_per_student` — enforce at table creation

`POST /api/tables` handler (`server/routes/tables.js`, after `canCreateTable` check):
```js
const limits = await SettingsService.getOrgSetting('org.platform_limits');
const activeTables = await TableRepository.countActiveTablesByUser(req.user.id);
if (activeTables >= (limits.max_tables_per_student ?? 4)) {
  return res.status(403).json({ error: 'table_limit_reached' });
}
```

New method needed: `TableRepository.countActiveTablesByUser(userId)` — counts rows in `tables` where `created_by = userId` and `status != 'closed'`.

### B. `max_players_per_table` — enforce at socket join

`join_room` handler (`server/socket/handlers/joinRoom.js`, before `gm.addPlayer()`):
```js
const limits = await SettingsService.getOrgSetting('org.platform_limits');
const seated = gm.state.players.filter(p => !p.isCoach && !p.isSpectator).length;
if (seated >= (limits.max_players_per_table ?? 9)) {
  return socket.emit('error', { message: 'Table is full' });
}
```

Note: `GameManager.max_players` (added above) may already enforce the per-table seat limit from the preset. `max_players_per_table` from org settings is a platform-wide cap — the lower of the two applies.

### C. Trial constants from org settings (Option B — registration only)

`POST /api/auth/register` (`server/routes/auth.js`):
- Replace hardcoded `TRIAL_DAYS = 7` and `TRIAL_HANDS = 20` with a live fetch of `org.platform_limits` at registration time
- `trial_expires_at = now + limits.trial_days * 24h`
- `trial_hands_remaining = limits.trial_hand_limit`
- Hardcoded constants stay as fallback values only

`decrementTrialHands` — **out of scope**, flagged for Phase 3. The counter is set correctly on registration; it just never decrements. Enforcement of the hand limit gate is a separate spec.

### Files
- `server/routes/tables.js` — `max_tables_per_student` check
- `server/db/repositories/TableRepository.js` — add `countActiveTablesByUser(userId)`
- `server/socket/handlers/joinRoom.js` — `max_players_per_table` check
- `server/routes/auth.js` — replace hardcoded trial constants with org settings fetch

---

## Regression Targets
- Existing personal table presets still load correctly in CreateTableModal
- `coached_cash` tables still work (coach manually sets blinds via socket — unchanged)
- `uncoached_cash` tables now correctly apply stored blinds (was broken, now fixed)
- Tournament blind preset system (`TournamentSetup.jsx`) untouched
- Trial registration still works when `org.platform_limits` is not yet set (fallback to constants)
- Staking contract creation still works with no school settings configured
- Table creation still works when `org.platform_limits` not set (fallback to 4)
- **Position mapping unaffected:** `buildPositionMap` uses `seated.length` not `max_players` — verified safe. No changes to `positions.js`.
- **Replay/scenario loading unaffected:** `ReplayEngine` never calls `addPlayer` or `_nextAvailableSeat` — `max_players` in state is invisible to it. No changes to `ReplayEngine.js`.
- **Drill sessions unaffected:** `PlaylistExecutionService`, `ScenarioDealer`, and `loadScenarioIntoConfig` all operate on already-seated players via direct state mutation — none call `addPlayer` or `_nextAvailableSeat`. Verified across entire drill/playlist code path.
- **Playlist hand matching unaffected:** `activeNonCoachCount()` counts `gm.state.players` directly; `findMatchingPlaylistIndex` matches on `player_count` from hand records — neither reads `max_players`.
- **ReplayEngine.branch() shadow players unaffected:** pushes directly into `state.players` using stored seat numbers from the hand record — bypasses seat assignment entirely.
- **Seat number integrity:** `max_players` clamped to `Math.min(N, 9)` — seat numbers always remain within 0–8, preserving DB hand record validity.

---

## Ideas to Consider (Future)
- **Trial hand decrement (Phase 3)**: Wire `decrementTrialHands()` into the hand-logging path so the counter actually enforces the limit. Requires finding the right hook in hand completion flow.
- **Leaderboard update_frequency**: Wire a scheduler or socket event to trigger leaderboard refresh. Shape: after-session hook calls a leaderboard snapshot job.

---

## Verification
1. Admin sets `primary_metric = hands_played` in Platform Defaults → Leaderboard page reloads → sorted by hand count
2. Admin creates blind preset "NL100, 6-Max" (bb=100, max_players=6) → coach opens CreateTableModal → preset appears in dropdown → selecting it sets BB=100, max_players=6 → only 6 seats available at the table
3. Uncoached cash table created with BB=100 → game starts with correct blinds (50/100), not default 5/10
4. Coach opens new staking contract → fields pre-filled with school defaults
5. Admin sets `max_tables_per_student = 1` → student creates a table → tries to create a second → gets 403 `table_limit_reached`
6. Admin sets `trial_days = 14` → new trial student registers → `trial_expires_at` is 14 days from now
7. Run `npm test` from `server/` — all existing tests pass