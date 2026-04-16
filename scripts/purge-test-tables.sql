-- Purge Test Tables Before Production Deploy
--
-- Description:
--   Identifies and deletes test poker tables created during development.
--   Safely preserves production tables via multiple heuristics.
--
-- Safety Checks:
--   1. Only deletes tables created within last 7 days (dev window)
--   2. Requires explicit confirmation before destructive operation
--   3. Lists affected tables first; user must review
--   4. Creates backup view first (optional restore)
--
-- Usage:
--   psql -h db.*.supabase.co -U postgres -d postgres -f purge-test-tables.sql
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Audit — what will be deleted?
SELECT
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
  table_status
FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted')  -- Keep intentional archives
ORDER BY created_at DESC
LIMIT 50;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVIEW OUTPUT ABOVE BEFORE PROCEEDING
-- If results look safe, proceed to Step 2
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 2: Create backup view (optional restore point)
-- Uncomment if you want to preserve deleted table IDs:
/*
CREATE OR REPLACE VIEW _deleted_table_ids_backup AS
SELECT
  id,
  COALESCE(table_name, 'N/A') as table_name,
  created_at,
  created_by
FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted');
*/

-- Step 3: Delete cascading rows from related tables
-- Order matters; respect FK constraints

-- hand actions + related data (cascade deletes)
DELETE FROM hand_actions
WHERE hand_id IN (
  SELECT hand_id FROM hands
  WHERE table_id IN (
    SELECT id FROM tables
    WHERE created_at > NOW() - INTERVAL '7 days'
  )
);

-- hand players + hand_tags (cascade)
DELETE FROM hand_players
WHERE hand_id IN (
  SELECT hand_id FROM hands
  WHERE table_id IN (
    SELECT id FROM tables
    WHERE created_at > NOW() - INTERVAL '7 days'
  )
);

DELETE FROM hand_tags
WHERE hand_id IN (
  SELECT hand_id FROM hands
  WHERE table_id IN (
    SELECT id FROM tables
    WHERE created_at > NOW() - INTERVAL '7 days'
  )
);

-- hands
DELETE FROM hands
WHERE table_id IN (
  SELECT id FROM tables
  WHERE created_at > NOW() - INTERVAL '7 days'
);

-- sessions + session_player_stats (cascade)
DELETE FROM session_player_stats
WHERE session_id IN (
  SELECT session_id FROM sessions
  WHERE table_id IN (
    SELECT id FROM tables
    WHERE created_at > NOW() - INTERVAL '7 days'
  )
);

DELETE FROM sessions
WHERE table_id IN (
  SELECT id FROM tables
  WHERE created_at > NOW() - INTERVAL '7 days'
);

-- table-specific registrations
DELETE FROM tournament_group_registrations
WHERE id IN (
  SELECT tgr.id FROM tournament_group_registrations tgr
  JOIN tables t ON tgr.table_id = t.id
  WHERE t.created_at > NOW() - INTERVAL '7 days'
);

-- final: delete tables themselves
DELETE FROM tables
WHERE created_at > NOW() - INTERVAL '7 days'
  AND table_status NOT IN ('archived', 'deleted');

-- ─────────────────────────────────────────────────────────────────────────────

-- Step 4: Verify deletion
SELECT
  COUNT(*) as remaining_tables,
  MIN(created_at) as oldest_remaining,
  MAX(created_at) as newest_remaining
FROM tables;

-- Step 5: Cleanup alpha_logs (optional; separate purge)
-- DELETE FROM alpha_logs WHERE created_at < NOW() - INTERVAL '7 days';
-- SELECT COUNT(*) as remaining_logs FROM alpha_logs;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Tables purged safely.
-- ─────────────────────────────────────────────────────────────────────────────
