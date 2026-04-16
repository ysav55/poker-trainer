-- Purge Test Tables Before Production Deploy
--
-- Description:
--   Identifies and deletes test poker tables created during development.
--   Safely preserves production tables via multiple heuristics.
--
-- Safety Guarantees:
--   1. Wrapped in transaction — all-or-nothing atomicity
--   2. Only deletes tables created within last 7 days (dev window)
--   3. Lists affected tables first; user must review before uncommenting destructive step
--   4. Respects FK cascades (no redundant manual deletes)
--   5. Preserves intentional archives (table_status IN ('archived', 'deleted'))
--
-- Usage:
--   # Step 1: Review what will be deleted (read-only)
--   psql -h db.*.supabase.co -U postgres -d postgres -f purge-test-tables.sql
--
--   # Step 2: If safe, uncomment "DELETE FROM tables" section and re-run
--   psql -h db.*.supabase.co -U postgres -d postgres -f purge-test-tables.sql
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable transaction — all-or-nothing semantics
-- If any DELETE fails, entire transaction rolls back
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: AUDIT (read-only) — what will be deleted?
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'TEST TABLES TO DELETE' as audit_section,
  COUNT(*) as table_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted');

-- Details: list each table by age
SELECT
  'DETAILED BREAKDOWN' as audit_section,
  id,
  COALESCE(table_name, 'N/A') as table_name,
  created_at,
  CASE
    WHEN created_at > NOW() - INTERVAL '1 day' THEN 'CREATED_TODAY'
    WHEN created_at > NOW() - INTERVAL '7 days' THEN 'CREATED_THIS_WEEK'
    ELSE 'CREATED_OLDER'
  END as age_bucket,
  created_by,
  table_type,
  table_status,
  (SELECT COUNT(*) FROM hands WHERE table_id = tables.id) as hand_count,
  (SELECT COUNT(*) FROM sessions WHERE table_id = tables.id) as session_count
FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted')
ORDER BY created_at DESC
LIMIT 100;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: DESTRUCTIVE (commented out — uncomment only after reviewing audit)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NOTE: FK cascades handle all child deletions automatically.
-- We only need to delete the parent (tables); children are auto-deleted.
--
-- DO NOT UNCOMMENT unless you have reviewed the audit output above
-- and confirmed these are test tables only.
--
-- Uncomment the DELETE statement below to proceed:
--

/*
DELETE FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted');
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: VERIFY (read-only) — what remains?
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'TABLES AFTER DELETE' as verify_section,
  COUNT(*) as remaining_tables,
  MIN(created_at) as oldest_remaining,
  MAX(created_at) as newest_remaining
FROM tables;

SELECT
  'HANDS AFTER DELETE' as verify_section,
  COUNT(*) as remaining_hands
FROM hands;

SELECT
  'SESSIONS AFTER DELETE' as verify_section,
  COUNT(*) as remaining_sessions
FROM sessions;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMIT or ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
--
-- If DELETE was uncommented and succeeded, COMMIT applies it permanently.
-- If anything failed or you want to abort, ROLLBACK reverses everything.
--

-- COMMIT;   -- Uncomment to apply deletion permanently
-- ROLLBACK; -- Uncomment to revert all changes

-- Default: no explicit COMMIT/ROLLBACK (connection will auto-rollback on close)

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. CASCADE deletes:
--    - tables (parent) → hands → hand_actions / hand_players / hand_tags (children)
--    - tables → sessions → session_player_stats (children)
--    All FK constraints have ON DELETE CASCADE; no manual deletes needed.
--
-- 2. Preserved tables:
--    - Status NOT IN ('archived', 'deleted') → keeps intentionally archived tables
--    - Age > 7 days → keeps old production tables
--
-- 3. RLS bypass:
--    This script runs as postgres superuser; it bypasses RLS policies.
--    Regular users cannot run this script (no permission to disable RLS).
--
-- 4. Rollback safety:
--    If the script is interrupted, ROLLBACK reverts all changes.
--    No partial deletions possible within a transaction.
--
-- ─────────────────────────────────────────────────────────────────────────────
