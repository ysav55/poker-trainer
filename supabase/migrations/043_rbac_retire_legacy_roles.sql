-- Migration 043: Retire legacy roles — player, moderator, referee
--
-- DESTRUCTIVE — run only after:
--   1. All moderator users have been manually moved to table delegation (tables.controller_id)
--   2. All referee users have been manually moved to tournament_referees rows
--   3. A full backup of the player_roles table has been taken
--
-- This migration:
--   a) Aborts if any moderator or referee users remain (safety gate)
--   b) Migrates all 'player' role users to coached_student (if coach_id set) or solo_student
--   c) Removes all 'player' role rows
--   d) Drops deprecated is_coach and is_roster columns from player_profiles

BEGIN;

-- ── Safety gate: abort if moderators or referees haven't been migrated yet ────
DO $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM   player_roles pr
  JOIN   roles r ON r.id = pr.role_id
  WHERE  r.name IN ('moderator', 'referee');

  IF cnt > 0 THEN
    RAISE EXCEPTION
      'Cannot proceed: % user(s) still hold moderator or referee roles. '
      'Migrate them to table delegation (tables.controller_id) or '
      'tournament delegation (tournament_referees) before running this migration.',
      cnt;
  END IF;
END $$;

-- ── Migrate 'player' → coached_student (has coach_id) or solo_student ────────

-- coached_student: player has been assigned to a coach
INSERT INTO player_roles (player_id, role_id, assigned_by, assigned_at)
SELECT
  pp.id,
  (SELECT id FROM roles WHERE name = 'coached_student'),
  NULL,
  now()
FROM player_profiles pp
JOIN player_roles pr  ON pr.player_id = pp.id
JOIN roles r          ON r.id = pr.role_id AND r.name = 'player'
WHERE pp.coach_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- solo_student: player has no assigned coach
INSERT INTO player_roles (player_id, role_id, assigned_by, assigned_at)
SELECT
  pp.id,
  (SELECT id FROM roles WHERE name = 'solo_student'),
  NULL,
  now()
FROM player_profiles pp
JOIN player_roles pr  ON pr.player_id = pp.id
JOIN roles r          ON r.id = pr.role_id AND r.name = 'player'
WHERE pp.coach_id IS NULL
ON CONFLICT DO NOTHING;

-- Remove old 'player' role rows (coached_student/solo_student rows now exist)
DELETE FROM player_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'player');

-- ── Drop deprecated columns ───────────────────────────────────────────────────
-- is_coach and is_roster were deprecated in migration 009 in favour of player_roles.
-- Verify the server no longer SELECTs these columns before applying.

ALTER TABLE player_profiles
  DROP COLUMN IF EXISTS is_coach,
  DROP COLUMN IF EXISTS is_roster;

COMMIT;
