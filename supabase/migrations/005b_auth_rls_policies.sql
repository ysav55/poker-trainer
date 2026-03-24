-- =============================================================================
-- Migration 005: Auth-based RLS policies (replaces migration 003 anon policies)
-- Run this AFTER Phase 1 auth migration is complete.
-- =============================================================================

-- Drop the temporary anon read policies from migration 003
DROP POLICY IF EXISTS hands_anon_read       ON hands;
DROP POLICY IF EXISTS hand_tags_anon_read   ON hand_tags;
DROP POLICY IF EXISTS hand_players_anon_read ON hand_players;
DROP POLICY IF EXISTS hand_actions_anon_read ON hand_actions;
DROP POLICY IF EXISTS sessions_anon_read    ON sessions;
DROP POLICY IF EXISTS leaderboard_anon_read ON leaderboard;
DROP POLICY IF EXISTS player_profiles_anon_read ON player_profiles;
DROP POLICY IF EXISTS playlists_anon_read   ON playlists;
DROP POLICY IF EXISTS playlist_hands_anon_read ON playlist_hands;

-- ── player_profiles ───────────────────────────────────────────────────────────
-- Players can read all profiles (for leaderboard display)
CREATE POLICY player_profiles_auth_read ON player_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Players can update their own profile
CREATE POLICY player_profiles_own_update ON player_profiles FOR UPDATE
  USING (id = auth.uid());

-- ── hands ─────────────────────────────────────────────────────────────────────
-- All authenticated users can read hands (leaderboard / hand history)
CREATE POLICY hands_auth_read ON hands FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── hand_players ──────────────────────────────────────────────────────────────
-- Coaches see all; students see only their own rows
CREATE POLICY hand_players_coach_read ON hand_players FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM player_profiles WHERE id = auth.uid() AND is_coach = true
  ));

CREATE POLICY hand_players_own_read ON hand_players FOR SELECT
  USING (player_id = auth.uid());

-- ── hand_actions ──────────────────────────────────────────────────────────────
CREATE POLICY hand_actions_auth_read ON hand_actions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── hand_tags ─────────────────────────────────────────────────────────────────
CREATE POLICY hand_tags_auth_read ON hand_tags FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── sessions ─────────────────────────────────────────────────────────────────
CREATE POLICY sessions_auth_read ON sessions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── leaderboard ───────────────────────────────────────────────────────────────
CREATE POLICY leaderboard_auth_read ON leaderboard FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── playlists + playlist_hands ────────────────────────────────────────────────
CREATE POLICY playlists_auth_read ON playlists FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY playlist_hands_auth_read ON playlist_hands FOR SELECT
  USING (auth.role() = 'authenticated');
