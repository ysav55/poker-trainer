-- Migration 061: Fix missing constraints from 058 (tournament_visibility)
--
-- Issues addressed:
-- 1. Add FK constraint on tournaments.school_id (was missing in 058)
-- 2. Add CHECK constraint: school-scoped tournaments must have school_id
-- 3. Add index on (school_id, privacy) for efficient filtering

-- Add missing foreign key on school_id (if column exists but no constraint)
ALTER TABLE tournaments
ADD CONSTRAINT fk_tournaments_school_id
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
ADD CONSTRAINT tournament_school_privacy_requires_school_id
  CHECK ((privacy != 'school') OR (school_id IS NOT NULL));

-- Index for filtering by school + privacy
CREATE INDEX IF NOT EXISTS idx_tournaments_school_privacy
  ON tournaments(school_id, privacy)
  WHERE privacy IN ('school', 'private');
