-- supabase/migrations/008_rbac.sql
-- Migration 008: Role-Based Access Control (RBAC)
-- Adds roles, permissions, role_permissions, and player_roles tables.
-- Seeds 7 system roles, 12 permissions, and role-permission assignments.
-- Uses subquery pattern — no hardcoded UUIDs.

BEGIN;

-- ---------------------------------------------------------------------------
-- ROLES
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category    VARCHAR(50)
);

-- ---------------------------------------------------------------------------
-- ROLE_PERMISSIONS  (many-to-many join)
-- ---------------------------------------------------------------------------
CREATE TABLE role_permissions (
  role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- PLAYER_ROLES  (many-to-many join)
-- ---------------------------------------------------------------------------
CREATE TABLE player_roles (
  player_id   UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES player_profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, role_id)
);

-- ---------------------------------------------------------------------------
-- SEED: Roles
-- ---------------------------------------------------------------------------
INSERT INTO roles (name, description, is_system) VALUES
  ('superadmin', 'Full system access — unrestricted',            true),
  ('admin',      'Administrative access across all features',    true),
  ('coach',      'Leads tables, tags hands, manages playlists',  true),
  ('moderator',  'Can tag hands and run tables; limited admin',  true),
  ('referee',    'Manages tournaments and table creation',       true),
  ('player',     'Standard player — no elevated permissions',    true),
  ('trial',      'Trial access — no permissions granted',        true);

-- ---------------------------------------------------------------------------
-- SEED: Permissions
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, description, category) VALUES
  ('table:create',       'Create and open new tables',                    'table'),
  ('table:manage',       'Manage existing tables (close, reconfigure)',   'table'),
  ('hand:tag',           'Tag hands with labels and notes',               'hand'),
  ('hand:analyze',       'Run automated hand analysis',                   'hand'),
  ('user:manage',        'Create, edit, and deactivate user accounts',    'user'),
  ('user:view',          'View user profiles and stats',                  'user'),
  ('playlist:create',    'Create new playlists',                          'playlist'),
  ('playlist:manage',    'Edit and delete any playlist',                  'playlist'),
  ('crm:view',           'View player CRM entries',                       'crm'),
  ('crm:edit',           'Edit player CRM entries',                       'crm'),
  ('admin:access',       'Access the admin dashboard',                    'admin'),
  ('tournament:manage',  'Create and manage tournaments',                 'tournament');

-- ---------------------------------------------------------------------------
-- SEED: Role → Permission assignments
-- ---------------------------------------------------------------------------

-- coach: hand:tag, hand:analyze, playlist:create, playlist:manage,
--        table:create, table:manage (own tables + students' tables), crm:view, admin:access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'coach'
  AND p.key IN (
    'hand:tag', 'hand:analyze',
    'playlist:create', 'playlist:manage',
    'table:create', 'table:manage',
    'crm:view', 'admin:access'
  );

-- moderator: hand:tag, hand:analyze, table:create, table:manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator'
  AND p.key IN ('hand:tag', 'hand:analyze', 'table:create', 'table:manage');

-- referee: tournament:manage, table:create, table:manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'referee'
  AND p.key IN ('tournament:manage', 'table:create', 'table:manage');

-- admin: all 12 permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin';

-- superadmin: all 12 permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'superadmin';

-- player and trial: no permissions assigned

COMMIT;
