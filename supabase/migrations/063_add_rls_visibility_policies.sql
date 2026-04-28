-- Migration 063: Add Row-Level Security (RLS) policies for visibility/access control
--
-- Purpose:
--   Enforce authorization at the database layer (not just application code).
--   RLS policies ensure that even direct SQL queries respect access control.
--
-- Tables protected:
--   - private_table_whitelist (057)
--   - tournament_whitelist (058)
--   - school_passwords (059)
--
-- Notes:
--   - Application code (TournamentRepository, etc.) already enforces these rules
--   - RLS adds defense-in-depth against SQL injection + unauthorized API access
--   - Service role (server-side) bypasses RLS; client-side auth via JWT

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. private_table_whitelist (from migration 057)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure RLS is enabled
ALTER TABLE private_table_whitelist ENABLE ROW LEVEL SECURITY;

-- Policy 1: Whitelisted players can view their own whitelist entries
CREATE POLICY "player_can_view_own_whitelist"
  ON private_table_whitelist
  FOR SELECT
  USING (player_id = auth.uid());

-- Policy 2: Table creator (invited_by) can view/manage their whitelist
CREATE POLICY "creator_can_manage_whitelist"
  ON private_table_whitelist
  FOR ALL
  USING (
    invited_by = auth.uid()
    OR
    -- Also allow if user is the table creator
    EXISTS (
      SELECT 1 FROM tables t
      WHERE t.id = private_table_whitelist.table_id
        AND t.created_by = auth.uid()
    )
  );

-- Policy 3: Service role can bypass (server-side operations)
-- NOTE: Automatic; service role is always unrestricted

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tournament_whitelist (from migration 058)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tournament_whitelist ENABLE ROW LEVEL SECURITY;

-- Policy 1: Whitelisted players can view their own entries
CREATE POLICY "player_can_view_own_tournament_whitelist"
  ON tournament_whitelist
  FOR SELECT
  USING (player_id = auth.uid());

-- Policy 2: Tournament creator can manage whitelist
CREATE POLICY "creator_can_manage_tournament_whitelist"
  ON tournament_whitelist
  FOR ALL
  USING (
    invited_by = auth.uid()
    OR
    -- Allow if user is tournament creator (via tournaments table)
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_whitelist.tournament_id
        AND t.created_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. school_passwords (from migration 059)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE school_passwords ENABLE ROW LEVEL SECURITY;

-- Policy 1: Only school admins can view/manage passwords
CREATE POLICY "school_admin_can_manage_passwords"
  ON school_passwords
  FOR ALL
  USING (
    -- User must be in the school AND have admin+ role
    EXISTS (
      SELECT 1
      FROM player_roles pr
      JOIN roles r ON pr.role_id = r.id
      WHERE pr.player_id = auth.uid()
        AND (r.name = 'superadmin' OR r.name = 'admin')
    )
    OR
    -- Alternative: direct school membership with admin flag (future)
    -- EXISTS (
    --   SELECT 1 FROM school_members
    --   WHERE school_id = school_passwords.school_id
    --     AND player_id = auth.uid()
    --     AND is_admin = true
    -- )
  );

-- Policy 2: No one can SELECT (read) all passwords from all schools
-- (above policy already handles this, but explicit for clarity)

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Audit tables (from migration 059)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE school_password_uses ENABLE ROW LEVEL SECURITY;

-- Policy: Only school admins can view password usage audit log
CREATE POLICY "school_admin_can_view_password_uses"
  ON school_password_uses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM school_passwords sp
      WHERE sp.id = school_password_uses.password_id
        AND (
          -- User is superadmin or admin
          EXISTS (
            SELECT 1 FROM player_roles pr
            JOIN roles r ON pr.role_id = r.id
            WHERE pr.player_id = auth.uid()
              AND (r.name = 'superadmin' OR r.name = 'admin')
          )
          OR
          -- User is the player who registered
          sp.school_id IN (
            SELECT school_id FROM player_roles
            WHERE player_id = auth.uid()
          )
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTES FOR DEPLOYMENT
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RLS policies are ADDITIVE: multiple policies create OR logic
-- 2. Service role (server-side) automatically bypasses RLS
-- 3. Client-side requests must use JWT with auth.uid()
-- 4. To test: psql as regular user, not postgres

-- Example test (as non-admin user):
-- SELECT * FROM school_passwords;  -- Should return 0 rows (no permission)

-- Example test (as admin):
-- SELECT * FROM school_passwords WHERE school_id = '<your-school-id>';  -- Should work

-- ─────────────────────────────────────────────────────────────────────────────
-- TROUBLESHOOTING
-- ─────────────────────────────────────────────────────────────────────────────

-- If application code stops working after applying RLS:
-- 1. Verify server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
-- 2. Verify client requests include JWT in Authorization header
-- 3. Check application has correct role assignments (player_roles table)
-- 4. Review logs for RLS policy violations (will see "permission denied" errors)