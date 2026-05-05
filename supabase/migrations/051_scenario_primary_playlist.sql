-- Migration 051: Add primary_playlist_id to scenarios
-- Tracks the playlist a scenario was created in so the builder UI can
-- organize scenarios by playlist. Nullable — existing scenarios stay as-is.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS primary_playlist_id UUID
  REFERENCES playlists(playlist_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scenarios_primary_playlist
  ON scenarios(primary_playlist_id)
  WHERE primary_playlist_id IS NOT NULL;
