# Settings Cascade Redesign

**Date:** 2026-04-16  
**Status:** Approved — Phase 1 (structure + cascade)  
**Phase 2 (wire settings to runtime behavior) is a separate spec.**

---

## Problem

Settings saved in School/Org tabs are never consumed at runtime. Org Tab and School Tab are siloed — no cascade. Org Tab is an orphaned surface. Coaches have no visibility into what platform defaults exist.

---

## Architecture

Three-tier cascade: **school override → org default → hardcoded fallback**

This pattern already exists for Table Defaults (`resolveTableDefaults` in `SettingsService`). This spec extends it to leaderboard config and blind structures.

```
Platform Tab (admin/superadmin)
  └─ sets org-level defaults
        └─ School Tab (coach)
              └─ can override per-school
                    └─ Resolved value used at runtime
```

---

## What Changes

### Tab Restructure

| Tab | Before | After |
|---|---|---|
| School | Identity, Passwords, Groups, Platforms, Staking Defaults, Leaderboard | Same + cascade indicators on Leaderboard + Blind Structures |
| Org | Blind Structures, Limits, Autospawn, Leaderboard | **Dissolved** — content moves to Platform Tab |
| Platform | School list, capacity, features | Two sub-tabs: **Schools** + **Platform Defaults** |

**Org Tab** is removed from the `ALL_TABS` array in `SettingsPage.jsx` for all roles.

---

### Platform Tab — Two Sub-tabs

**Schools sub-tab** (unchanged):
- School list table (capacity + feature toggles per school)

**Platform Defaults sub-tab** (absorbs Org Tab):
- Leaderboard defaults (primary_metric, secondary_metric, update_frequency)
- Blind structure library (CRUD — label, SB, BB, ante)
- Platform limits (max_tables_per_student, max_players_per_table, trial_days, trial_hand_limit)
- Autospawn config

Backend: calls existing `/api/admin/org-settings/*` endpoints — no backend changes for this sub-tab.

---

### School Tab — Cascade Sections

**No change:** Identity, Passwords, Groups, Staking Defaults, Platforms  
*(Staking defaults and platforms are school-only — no org-level counterpart.)*

**New cascade behavior — Leaderboard section:**
- `GET /api/settings/school` returns leaderboard as `{ value: {...}, source: 'school' | 'org' | 'hardcoded' }`
- CascadeLabel badge next to section header (reuse existing component from `TableDefaultsTab`)
- Fields editable regardless of source
- "Reset to platform default" link deletes the school-scope row, falls back to org
- Save writes to `school.leaderboard` as today

**New cascade behavior — Blind Structures section:**
- `GET /api/settings/school/blind-structures` returns merged array: school structures first, org structures appended
- Each entry tagged `source: 'school' | 'org'`
- School-made structures: full CRUD (add/edit/delete)
- Org structures: read-only, shown below a divider labeled "Platform presets"
- No "reset" concept — additive, not override

---

## Backend Changes

### New endpoints
```
GET    /api/settings/school/blind-structures          → merged list (school first, org below)
POST   /api/settings/school/blind-structures          → add school-specific structure { label, sb, bb, ante }
PATCH  /api/settings/school/blind-structures/:id      → edit school structure
DELETE /api/settings/school/blind-structures/:id      → delete school structure
```
GET logic:
1. Load `school.blind_structures` for coach's school (key in `settings` table)
2. Load `org.blind_structures` from org scope
3. Return `[...schoolStructures.map(s => ({...s, source:'school'})), ...orgStructures.map(s => ({...s, source:'org'}))]`

POST/PATCH/DELETE operate only on the `school.blind_structures` array in the `settings` table (coach cannot modify org structures).

### Modified endpoint
```
GET /api/settings/school
```
Leaderboard section response changes from:
```json
{ "leaderboard": { "primary_metric": "net_chips", ... } }
```
to:
```json
{
  "leaderboard": {
    "value": { "primary_metric": "net_chips", "secondary_metric": "win_rate", "update_frequency": "daily" },
    "source": "org"
  }
}
```
`source` is `'school'` if `school.leaderboard` key exists for this school, else `'org'` if `org.leaderboard` exists, else `'hardcoded'`.

### New SettingsService methods
- `resolveLeaderboardConfig(schoolId)` → `{ value, source }`
- `resolveBlindStructures(schoolId)` → merged array with `source` field per entry

### No new DB migrations
`settings` table already supports any `(scope, scope_id, key)` combination.

---

## Frontend Files to Change

| File | Change |
|---|---|
| `client/src/pages/SettingsPage.jsx` | Remove `org` from `ALL_TABS`; add sub-tab rendering to `platform` tab |
| `client/src/pages/settings/PlatformTab.jsx` | Add sub-tab switcher (Schools / Platform Defaults); move current content under Schools sub-tab; create Platform Defaults sub-tab with OrgTab sections |
| `client/src/pages/settings/OrgTab.jsx` | **Delete** (content migrated) |
| `client/src/pages/settings/SchoolTab.jsx` | Add CascadeLabel to leaderboard section; add blind structures section with merged display + school CRUD |

## Backend Files to Change

| File | Change |
|---|---|
| `server/routes/settings.js` | Update `GET /api/settings/school` to return cascade-resolved leaderboard with `{ value, source }`; add blind structures endpoints (GET + POST + PATCH/:id + DELETE/:id) |
| `server/services/SettingsService.js` | Add `resolveLeaderboardConfig(schoolId)` and `resolveBlindStructures(schoolId)` |

---

## Reused Components
- `CascadeLabel` — already in `TableDefaultsTab.jsx`, extract to `client/src/pages/settings/shared.jsx`
- `SectionHeader`, `Field`, `Input`, `Select`, `SaveButton` — all in `shared.jsx`, unchanged

---

## Regression Targets
- Table Defaults tab cascade still works (untouched)
- Existing school identity / passwords / groups / staking / platforms save unaffected
- Org-level blind structures CRUD still works (same backend, just new UI home)
- Feature toggles in Platform tab unaffected

---

## Out of Scope (Phase 2)
- Leaderboard page actually sorting by `primary_metric`
- Staking contract pre-filling from defaults
- Blind structures appearing in table creation form
- Platform limits enforced at runtime

## Ideas to Consider (Future)

### Autospawn
Stored config (`enabled`, `occupancy_threshold`, `default_config`) with no consuming code today. Wiring this is a **feature build**, not a wiring task — requires a scheduler or occupancy-triggered spawner, neither of which exists. Recommend a dedicated spec when the product need is clearer. Shape: daemon or socket event watches active table occupancy, spawns a bot_cash table when occupancy_threshold is breached, uses `default_config` as table config.

---

## Verification
1. Admin saves leaderboard defaults in Platform Tab → Platform Defaults sub-tab → DB row created at `scope='org'`
2. Coach opens School Tab → Leaderboard shows badge "using platform default" with org value
3. Coach overrides primary_metric → saves → badge flips to "school override"
4. Coach clicks "Reset to platform default" → school row deleted → badge returns to "using platform default"
5. Coach adds a blind structure → appears at top of list with no source badge (or "school" badge)
6. Org blind structures appear below divider "Platform presets" — no edit/delete controls
7. Navigate to /settings → Org tab is gone from nav
8. Run `npm test` from server/ — all existing tests pass