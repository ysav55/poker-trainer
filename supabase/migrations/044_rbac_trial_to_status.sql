-- Migration 044: Convert trial from a role to a computed status flag
--
-- trial_expires_at and trial_hands_remaining already exist on player_profiles
-- (added in migration 014b). This migration adds a generated computed column
-- trial_active that derives the current trial status from those columns.
--
-- This is a NON-DESTRUCTIVE migration. The 'trial' role is intentionally kept
-- in the roles table during the 30-day JWT dual-support window. Users with
-- existing JWTs containing role='trial' continue to work. New registrations
-- receive 'coached_student' or 'solo_student' role + trial_expires_at set.
--
-- After the JWT window closes, run migration 045 to retire the 'trial' role.

BEGIN;

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS trial_active BOOLEAN GENERATED ALWAYS AS (
    trial_expires_at IS NOT NULL
    AND trial_expires_at > now()
    AND (trial_hands_remaining IS NULL OR trial_hands_remaining > 0)
  ) STORED;

COMMIT;
