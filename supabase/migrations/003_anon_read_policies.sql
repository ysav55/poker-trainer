-- =============================================================================
-- Migration 003: Temporary anon read policies for Phase 3 (pre-auth)
-- Allow unauthenticated reads on all public-facing tables.
-- Phase 1 (auth migration) will replace these with user-specific policies.
-- =============================================================================

CREATE POLICY hands_anon_read      ON hands           FOR SELECT USING (true);
CREATE POLICY hand_tags_anon_read  ON hand_tags       FOR SELECT USING (true);
CREATE POLICY hand_players_anon_read ON hand_players  FOR SELECT USING (true);
CREATE POLICY hand_actions_anon_read ON hand_actions  FOR SELECT USING (true);
CREATE POLICY sessions_anon_read   ON sessions        FOR SELECT USING (true);
CREATE POLICY leaderboard_anon_read ON leaderboard    FOR SELECT USING (true);
CREATE POLICY player_profiles_anon_read ON player_profiles FOR SELECT USING (true);
CREATE POLICY playlists_anon_read  ON playlists       FOR SELECT USING (true);
CREATE POLICY playlist_hands_anon_read ON playlist_hands FOR SELECT USING (true);
