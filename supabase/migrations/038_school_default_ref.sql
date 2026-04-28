-- Migration 038: Add default tournament referee setting to schools.
BEGIN;

ALTER TABLE schools
  ADD COLUMN default_tournament_ref_id UUID REFERENCES player_profiles(id) ON DELETE SET NULL;

COMMIT;
