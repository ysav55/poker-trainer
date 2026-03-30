# Item 3: RBAC System

**Status**: ⬜ pending
**Blocks**: Items 4, 5, 1, 2, 6, 7, 8, 9

---

## Context

Current auth is binary: `is_coach` boolean in JWT + `requireRole('coach')` in 2 route files
(`playlists.js`, `alphaReport.js`) + `requireCoach(socket, action)` in ~30 socket guard
locations in `socketGuards.js`. `player_profiles.is_coach` column exists but is never synced
with the JWT payload.

This item adds a proper roles + permissions system and replaces all existing guards.

---

## Migration 007 — RBAC Tables

```sql
-- supabase/migrations/007_rbac.sql

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50)
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE player_roles (
  player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES player_profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, role_id)
);

-- Seed roles
INSERT INTO roles (name, description, is_system) VALUES
  ('superadmin', 'Platform owner — all permissions', true),
  ('admin', 'School administrator', true),
  ('coach', 'Instructor', true),
  ('moderator', 'Session moderator', true),
  ('referee', 'Tournament official', true),
  ('player', 'Standard student', true),
  ('trial', 'Limited access player', true);

-- Seed permissions
INSERT INTO permissions (key, description, category) VALUES
  ('table:create', 'Create new tables', 'table'),
  ('table:manage', 'Close/modify any table', 'table'),
  ('hand:tag', 'Tag hands and run analysis', 'hand'),
  ('hand:analyze', 'Trigger hand analysis', 'hand'),
  ('user:manage', 'Create/edit/archive users', 'admin'),
  ('user:view', 'View user profiles and stats', 'admin'),
  ('playlist:create', 'Create playlists', 'playlist'),
  ('playlist:manage', 'Edit/delete any playlist', 'playlist'),
  ('crm:view', 'View player CRM data', 'crm'),
  ('crm:edit', 'Add notes, schedule sessions', 'crm'),
  ('admin:access', 'Access admin routes', 'admin'),
  ('tournament:manage', 'Create and manage tournaments', 'tournament');

-- Assign permissions to roles
-- coach: hand:tag, hand:analyze, playlist:create, playlist:manage, table:create, crm:view, admin:access
-- admin: all except superadmin-only ops
-- player: no special permissions
-- (full mapping via INSERT INTO role_permissions in migration)
```

---

## New Files

### `server/auth/requirePermission.js`

```js
import { supabase } from '../db/supabase.js';

// In-memory cache: Map<playerId, Set<permKey>>
const permissionCache = new Map();

export async function getPlayerPermissions(playerId) {
  if (permissionCache.has(playerId)) return permissionCache.get(playerId);

  const { data } = await supabase
    .from('player_roles')
    .select('roles(role_permissions(permissions(key)))')
    .eq('player_id', playerId);

  const keys = new Set(
    data?.flatMap(pr =>
      pr.roles?.role_permissions?.map(rp => rp.permissions?.key).filter(Boolean) ?? []
    ) ?? []
  );

  permissionCache.set(playerId, keys);
  return keys;
}

export function invalidatePermissionCache(playerId) {
  permissionCache.delete(playerId);
}

export function requirePermission(...keys) {
  return async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const perms = await getPlayerPermissions(req.user.id);
    if (keys.every(k => perms.has(k))) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}
```

### `server/auth/socketPermissions.js`

```js
import { getPlayerPermissions } from './requirePermission.js';

export async function requireSocketPermission(socket, ...keys) {
  const playerId = socket.data.playerId;
  if (!playerId) {
    socket.emit('error', { message: 'Not authenticated' });
    return false;
  }
  const perms = await getPlayerPermissions(playerId);
  if (!keys.every(k => perms.has(k))) {
    socket.emit('error', { message: 'Insufficient permissions' });
    return false;
  }
  return true;
}
```

---

## Modified Files

| File | Change |
|------|--------|
| `server/routes/playlists.js` | `requireRole('coach')` → `requirePermission('playlist:manage')` on mutation routes |
| `server/routes/alphaReport.js` | `requireRole('coach')` → `requirePermission('admin:access')` |
| `server/auth/socketGuards.js` | `requireCoach(socket, action)` → `requireSocketPermission(socket, 'hand:tag')` |

### socketGuards.js replacement pattern

Current:
```js
function requireCoach(socket, action) {
  if (!socket.data.isCoach) {
    socket.emit('error', { message: `Only coaches can ${action}` });
    return false;
  }
  return true;
}
```

New (async):
```js
// requireCoach stays as a fast synchronous fallback for existing handlers
// New handlers use requireSocketPermission directly
// Migration: replace requireCoach calls one handler at a time
```

**Note**: `requireCoach` is kept as a fast sync check during the transition. New admin
handlers use `requireSocketPermission`. All `requireCoach` calls in socket handlers are
migrated to `requireSocketPermission(socket, 'hand:tag')` in this item.

---

## Backward Compatibility

- JWT payload shape unchanged: `{ stableId, name, role }` — `role` field still `'coach'|'student'`
- `requireRole('coach')` in `server/auth/requireRole.js` stays (used by `requireAuth` middleware
  as a fast path). Deprecated after Item 4 when DB-backed auth ships.
- Permission cache is in-memory only — acceptable for single-instance Fly.io. Cache is
  invalidated when roles are changed via Item 4's admin API.

---

## Key Files to Read Before Implementing

- `server/auth/requireRole.js` — 6-line fast path check
- `server/auth/socketGuards.js` — full list of ~30 `requireCoach` calls
- `server/routes/playlists.js` — 2 routes using `requireRole('coach')`
- `server/routes/alphaReport.js` — 1 route using `requireRole('coach')`
- `supabase/migrations/001_initial_schema.sql` — `player_profiles` schema (confirm UUID PK)
- `server/db/` — confirm which Supabase client to import

---

## Tests

- Unit: `requirePermission` middleware — allowed, denied, missing req.user
- Unit: `getPlayerPermissions` — returns correct Set from mock Supabase response
- Unit: `invalidatePermissionCache` — forces re-fetch on next call
- Unit: `requireSocketPermission` — returns false and emits error when denied
- Integration: seed coach role → coach JWT → `requirePermission('hand:tag')` passes
- Integration: player JWT → `requirePermission('hand:tag')` returns 403
