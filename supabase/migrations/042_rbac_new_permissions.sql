-- Migration 042: RBAC permission grants for new role schema
--
-- Additive only — no existing data modified, no roles removed.
-- Safe to apply at any time without a maintenance window.
--
-- Changes:
--   1. Grant crm:edit to coach (previously only had crm:view)
--   2. Grant staking:view to coached_student and solo_student

BEGIN;

-- 1. Coach gets crm:edit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.name = 'coach'
  AND  p.key  = 'crm:edit'
ON CONFLICT DO NOTHING;

-- 2. coached_student and solo_student get staking:view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.name IN ('coached_student', 'solo_student')
  AND  p.key  = 'staking:view'
ON CONFLICT DO NOTHING;

COMMIT;
