# Item 4: User Management

**Status**: ⬜ pending
**Blocked by**: Item 3 (RBAC — admin routes need requirePermission)
**Blocks**: Item 5 (lobby needs DB-backed auth), Item 7 (coach identity in DB for scenario authoring)

---

## Context

Current: `PlayerRoster.js` reads `players.csv` at boot, bcrypt-compares at login. Adding a
player requires editing CSV + running `scripts/hash-passwords.js` + redeploying. `player_profiles`
has no email, no password_hash, no status. JWT payload includes `role` from CSV but `player_profiles.is_coach`
is never synced.

Goal: move credentials into DB, add admin CRUD UI, retire the CSV workflow.

---

## Migration 008 — Extend player_profiles

```sql
-- supabase/migrations/008_user_management.sql

ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'archived'));
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES player_profiles(id);

-- Keep is_coach and is_roster for now (deprecated; removed after migration script confirms data)
```

---

## One-Time Migration Script: `scripts/migrate-roster-to-db.js`

```js
// Run once after migration 008 is applied:
//   node scripts/migrate-roster-to-db.js
//
// Reads players.csv (name,bcrypt_hash,role), upserts into player_profiles
// with password_hash, assigns roles via player_roles.
// Does NOT delete players.csv — manual removal after verification.

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { supabaseAdmin } from '../server/db/supabase.js';

const csv = readFileSync('players.csv', 'utf8');
const rows = parse(csv, { columns: true });

for (const row of rows) {
  // 1. Upsert player_profiles (display_name unique)
  // 2. Set password_hash
  // 3. Look up role UUID from roles table
  // 4. Insert into player_roles
}
```

---

## Rewrite: `server/auth/PlayerRoster.js`

Replace CSV file reading with DB query. Keep the same public interface so
`server/routes/auth.js` is unchanged.

```js
import { PlayerRepository } from '../db/repositories/PlayerRepository.js';
import bcrypt from 'bcrypt';

export async function authenticate(name, password) {
  const player = await PlayerRepository.findByDisplayName(name);
  if (!player || !player.password_hash) return null;
  if (player.status === 'suspended' || player.status === 'archived') return null;
  const valid = await bcrypt.compare(password, player.password_hash);
  if (!valid) return null;
  const role = await PlayerRepository.getPrimaryRole(player.id);
  return { id: player.id, name: player.display_name, role: role ?? 'player' };
}
```

---

## New Repository Methods: `server/db/repositories/PlayerRepository.js`

Add to existing file:

```js
findByDisplayName(name)                       // existing — already uses .eq() with case_insensitive
getPrimaryRole(playerId)                      // JOIN player_roles → roles, return highest-privilege name
createPlayer({ displayName, email, passwordHash, createdBy })  // → UUID
updatePlayer(id, patch)                       // patch: { displayName, email, status, avatarUrl }
archivePlayer(id)                             // status = 'archived' (no hard delete)
setPassword(id, passwordHash)                 // UPDATE password_hash
assignRole(playerId, roleId, assignedBy)      // INSERT into player_roles
removeRole(playerId, roleId)                  // DELETE from player_roles
listPlayers({ status, role, limit, offset })  // paginated list with optional filters
```

---

## New Admin API: `server/routes/admin/users.js`

All routes gated by `requireAuth` + `requirePermission('user:manage')`.

| Method | Path | Body / Params | Action |
|--------|------|---------------|--------|
| GET | /api/admin/users | `?status=active&role=coach` | List users |
| POST | /api/admin/users | `{ name, email, password, role }` | Create user |
| GET | /api/admin/users/:id | — | Get user detail |
| PUT | /api/admin/users/:id | `{ name, email, status, avatarUrl }` | Update user |
| DELETE | /api/admin/users/:id | — | Archive user (status → 'archived') |
| POST | /api/admin/users/:id/reset-password | `{ password }` | Set new password (bcrypt server-side) |
| POST | /api/admin/users/:id/roles | `{ roleId, action: 'assign'|'remove' }` | Manage roles |

Password hashing: plaintext HTTPS → `bcrypt.hash(password, 12)` server-side. Never log or store plaintext.

On role change: call `invalidatePermissionCache(playerId)` from Item 3.

---

## New Frontend Pages: `client/src/pages/admin/`

### `UserManagement.jsx`
- Searchable table: display_name, email, roles, status, last_seen
- Filter bar: role dropdown, status toggle (active/suspended/archived)
- Row actions: Edit, Reset Password, Archive
- "Create User" button → opens `UserForm`

### `UserForm.jsx`
Modal for create/edit:
- Fields: Name, Email, Password (create only — hashed server-side), Role checkboxes
- On save: POST (create) or PUT (edit) to admin API
- Clears form and refreshes user list on success

### `UserDetail.jsx`
Read-only profile view:
- Avatar, name, email, status badge
- Roles list with assigned-at timestamps
- Last seen, created at, created by
- "Edit" button → opens `UserForm`

---

## Register New Routes in `server/index.js`

```js
import adminUsersRouter from './routes/admin/users.js';
app.use('/api/admin', requireAuth, adminUsersRouter);
```

---

## Key Files to Read Before Implementing

- `server/auth/PlayerRoster.js` — full file (CSV loading pattern to replace)
- `server/routes/auth.js` — login endpoint (interface that must stay unchanged)
- `server/db/repositories/PlayerRepository.js` — existing methods to extend
- `players.csv` — confirm column names (name, bcrypt_hash, role or similar)
- `supabase/migrations/001_initial_schema.sql` — player_profiles current schema
- `supabase/migrations/007_rbac.sql` — roles table (needed for role assignment)

---

## Tests

- Unit: `authenticate()` — valid creds, wrong password, suspended user, archived user
- Unit: `createPlayer`, `archivePlayer`, `setPassword`
- Unit: `getPrimaryRole` — returns 'coach' for player with coach role
- Integration: POST /api/admin/users → user can log in → JWT has correct role
- Integration: POST /api/admin/users/:id/reset-password → new password works, old JWT still valid
- Integration: DELETE /api/admin/users/:id → status = 'archived' → cannot log in
- Integration: `migrate-roster-to-db.js` script → all CSV entries present in DB with correct roles
