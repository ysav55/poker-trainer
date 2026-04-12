-- supabase/migrations/009_user_management.sql
-- Migration 009: User Management — extend player_profiles with auth and profile fields.
-- Adds email, password_hash, status, avatar_url, notes, metadata, and created_by.
-- NOTE: is_coach and is_roster columns are DEPRECATED as of this migration.
--       They are kept in place until the roster migration script confirms all data
--       has been moved to the player_roles table (migration 008). Remove them in
--       a future migration once that migration script is verified complete.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extend player_profiles with user-management columns
-- ---------------------------------------------------------------------------
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS email         VARCHAR(255);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'archived'));
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS avatar_url    TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS notes         TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}';
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES player_profiles(id);

-- ---------------------------------------------------------------------------
-- Index: fast look-up by email (unique — one account per address)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_email
  ON player_profiles (email)
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Index: filter by status (e.g. WHERE status = 'active')
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_player_profiles_status
  ON player_profiles (status);

COMMIT;
