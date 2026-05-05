-- supabase/migrations/017_school_management.sql
-- Migration 017: School Management — adds school:manage permission, capacity
-- columns on schools, and all supporting infrastructure.

BEGIN;

-- ---------------------------------------------------------------------------
-- New permission: school:manage
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, description)
VALUES ('school:manage', 'Create, update, and delete schools')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('superadmin', 'admin')
  AND p.key = 'school:manage'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Add capacity + audit columns to schools
-- ---------------------------------------------------------------------------
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS max_coaches  INTEGER,
  ADD COLUMN IF NOT EXISTS max_students INTEGER,
  ADD COLUMN IF NOT EXISTS status       VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES player_profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by   UUID REFERENCES player_profiles(id);

COMMIT;
