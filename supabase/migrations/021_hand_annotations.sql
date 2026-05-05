-- supabase/migrations/021_hand_annotations.sql
-- Creates the hand_annotations table used by the Review Table page.
-- server/routes/annotations.js and SessionPrepService.js both reference this table.
-- Note: hands.hand_id is UUID (not bigint) per migration 001.

BEGIN;

CREATE TABLE IF NOT EXISTS hand_annotations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id      UUID        NOT NULL REFERENCES hands(hand_id) ON DELETE CASCADE,
  action_index INTEGER     NOT NULL,
  author_id    UUID        REFERENCES player_profiles(id) ON DELETE SET NULL,
  text         TEXT        NOT NULL CHECK (char_length(text) <= 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hand_annotations_hand_id
  ON hand_annotations(hand_id);

-- RLS
ALTER TABLE hand_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annotations_read_all"
  ON hand_annotations FOR SELECT
  USING (true);

CREATE POLICY "annotations_insert_own"
  ON hand_annotations FOR INSERT
  WITH CHECK (auth.uid() = author_id OR author_id IS NULL);

CREATE POLICY "annotations_delete_own"
  ON hand_annotations FOR DELETE
  USING (author_id = auth.uid());

COMMIT;
