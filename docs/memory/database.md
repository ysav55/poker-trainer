# Database — Supabase/Postgres Schema, Migrations & RLS

> Source of Truth. Last updated: 2026-04-06.

---

## Connection

- **Supabase (PostgreSQL)** — service-role key, server-side only
- No anon key in browser — `client/src/lib/supabase.js` is a Proxy stub that throws
- ~40 tables, leaderboard view + triggers

---

## Migration History

Migrations live in `supabase/migrations/`. Numbered sequentially. **Never edit an applied migration — always write a new one.**

| Range | Status |
|-------|--------|
| `001` – `020b` | Applied to live Supabase DB |
| `021` (hand_annotations) | Committed to git — pending production apply |
| `022` (fix_announcement_author_not_null) | Committed — pending production apply |
| `023` (schema_fixes) | Committed — pending production apply |
| `024` (groups) | Committed — pending production apply |
| `040` (tournament_bridge) | Committed on `feat/phase2` — bridges System A/B via `table_id` FK |
| `041` (hand_table_mode) | **Applied to production 2026-04-06** — adds `hands.table_mode TEXT CHECK(...)` |
| `042` (rbac_new_permissions) | Committed on `feat/phase2` — grants `crm:edit` to coach, `staking:view` to coached_student + solo_student |
| `043` (rbac_retire_legacy_roles) | Committed on `feat/phase2` — safety gate + migrates `player` → `coached_student`/`solo_student`, drops `is_coach`/`is_roster` columns |
| `044` (rbac_trial_to_status) | Committed on `feat/phase2` — adds `trial_active BOOLEAN GENERATED ALWAYS AS (...)` computed column |

Next sequential migration should be `045_...`

---

## Key Tables

### Core Game
| Table | Key Columns | Notes |
|-------|-------------|-------|
| `hands` | `id`, `table_id`, `session_id`, `created_at`, `table_mode` | One row per hand; `table_mode` ∈ `coached_cash\|uncoached_cash\|tournament\|bot_cash`, NULL for historical rows |
| `hand_players` | `hand_id`, `player_id`, `seat`, `starting_stack` | |
| `hand_actions` | `id`, `hand_id`, `player_id`, `action`, `amount`, `street`, `position VARCHAR(8)` | `position` added migration 006 |
| `hand_tags` | `id`, `hand_id`, `tag`, `tag_type`, `player_id UUID` (nullable), `action_id BIGINT` (nullable) | 3 partial unique indexes (migration 006) |

### Players & Auth
| Table | Key Columns | Notes |
|-------|-------------|-------|
| `player_profiles` | `id UUID`, `display_name`, `email`, `password_hash`, `role`, `status` | `display_name` has case-insensitive collation |
| `player_roles` | `player_id`, `role_id`, `school_id` | |
| `roles` | `id`, `name` | |
| `role_permissions` | `role_id`, `permission_id` | |
| `permissions` | `id`, `key` | 16 keys |

### Sessions & Stats
| Table | Key Columns | Notes |
|-------|-------------|-------|
| `sessions` | `id`, `table_id`, `started_at`, `ended_at` | |
| `session_player_stats` | `session_id`, `player_id`, `quality_score` | `quality_score` from SessionQualityService |
| `student_baselines` | `player_id`, `vpip`, `pfr`, `wtsd`, `wsd`, `cbet`, `aggression`, `updated_at` | 30-day rolling |

### Tables & Tournaments
| Table | Key Columns | Notes |
|-------|-------------|-------|
| `tables` | `id`, `name`, `mode`, `privacy`, `status` | `mode`: coached_cash / uncoached_cash / tournament / bot_cash |
| `tournaments` | `id`, `table_id` (FK added migration 040), `name`, `status` | System B — `table_id` bridges to System A |
| `tournament_players` | `tournament_id`, `player_id`, `status`, `chips` | System B |
| `tournament_referees` | `tournament_id`, `player_id` | Scoped access for `requireTournamentAccess()` |

### School & Groups
| Table | Notes |
|-------|-------|
| `schools` | School capacity, feature toggles |
| `groups` | Named color-coded cohorts (migration 024) |
| `group_members` | `group_id`, `player_id` |

### Coach Intelligence
| Table | Notes |
|-------|-------|
| `alert_instances` | 6 detector types; dedup upsert |
| `session_prep_briefs` | 1-hour cache for SessionPrepService |
| `hand_annotations` | Coach annotations per action index (migration 021) |

### Financial
| Table | Notes |
|-------|-------|
| `chip_bank_transactions` | Virtual chip buy-in/cash-out/adjust |
| `staking_contracts` | Real-money external staking tracking |
| `staking_sessions` | Individual session entries (48-hour edit window) |
| `staking_settlements` | Settlement snapshots requiring dual approval |

---

## Critical Schema Details

### `hand_tags` (migration 006)
- `player_id UUID` — nullable (hand-level tags have null player_id)
- `action_id BIGINT` — nullable (player-level tags without specific action)
- 3 partial unique indexes replace the old single unique constraint
- **Only `replaceAutoTags()` may delete `auto`, `mistake`, or `sizing` type tags**

### `hand_actions` (migration 006)
- Added `position VARCHAR(8)` — populated by `buildPositionMap()` at deal time

### `player_profiles.display_name`
- COLLATE case_insensitive (nondeterministic collation)
- Use `.eq()` for login queries — `.ilike()` throws on nondeterministic collations

---

## Leaderboard

- Implemented as a DB view (not a table)
- Backed by `hand_players` and `hand_actions` aggregate queries
- **Leaderboard period/game-type filters in the frontend are non-functional stubs** (always return all-time data regardless of filter sent) — P1 issue

---

## RLS (Row Level Security)

- Service-role key bypasses RLS — all server-side queries run with full privileges
- No RLS policies currently enforced for application logic; access control is via Express middleware
- Do not add RLS without coordinating with the existing RBAC middleware layer

---

## DB Query Conventions

- Use explicit column names in SELECT — no `SELECT *` in committed code (enforced in Phase 9 refactor)
- Parallel DB queries via `Promise.allSettled` in analyzer pipeline (never `Promise.all`)
- Permission cache: in-memory Map keyed by stableId; invalidated on role change
