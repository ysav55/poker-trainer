-- Migration 054: persist playlist color.
-- Golden-angle color is computed client-side on create and stored here so
-- reorders / deletes don't shift colors. Nullable — legacy rows keep their
-- index-derived color via frontend fallback. Color is write-once: the API
-- layer rejects color updates after POST.

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS color TEXT;
