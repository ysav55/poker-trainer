-- Migration 014: Trial fields + coached_student / solo_student roles
-- Adds self-registration trial support and new student sub-roles.

-- 1. Extend player_profiles with trial tracking columns
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS trial_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_hands_remaining INTEGER;

-- 2. Allow 'pending' as a valid status value (documented convention, no CHECK constraint added
--    to stay compatible with existing enum-less TEXT status column from migration 009).

-- 3. Seed new roles: coached_student and solo_student
INSERT INTO roles (name, description, is_system)
VALUES
  ('coached_student', 'Student registered under a specific coach', true),
  ('solo_student',    'Student registered without a coach (self-directed)', true)
ON CONFLICT (name) DO NOTHING;

-- 4. coached_student and solo_student inherit the same permissions as 'player' (none by default).
--    No rows needed in role_permissions for these roles at this time.
