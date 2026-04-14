-- Migration 055: grant crm:view to coach role
-- Coaches need crm:view to access /api/admin/players (Students CRM).
-- crm:edit remains admin-only.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'coach'
  AND p.key = 'crm:view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
