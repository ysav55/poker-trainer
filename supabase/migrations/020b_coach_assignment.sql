-- supabase/migrations/020_coach_assignment.sql
-- Migration 020: Add coach_id to player_profiles for coach-student assignment.
-- Allows admins to assign a coach to any player profile via the user management UI.

BEGIN;

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES player_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_player_profiles_coach
  ON player_profiles (coach_id)
  WHERE coach_id IS NOT NULL;

COMMIT;
