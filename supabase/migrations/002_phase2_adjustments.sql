-- =============================================================================
-- Migration 002: Phase 2 adjustments
-- Drop auth.users FK from player_profiles so roster players (who don't have
-- Supabase Auth accounts yet) can be stored. Phase 1 (auth migration) will
-- re-link player_profiles to auth.users.
-- =============================================================================

-- Drop the FK that requires player_profiles.id to exist in auth.users.
-- player_profiles becomes a standalone identity table for now.
ALTER TABLE player_profiles DROP CONSTRAINT IF EXISTS player_profiles_id_fkey;
