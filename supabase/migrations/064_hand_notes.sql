-- 064_hand_notes.sql
-- Coach hand-level notes (school-scoped read/write).
-- Spec: docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md section 6.1.

BEGIN;

CREATE TABLE IF NOT EXISTS hand_notes (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id            UUID         NOT NULL REFERENCES hands(hand_id) ON DELETE CASCADE,
  school_id          UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_player_id   UUID         REFERENCES player_profiles(id) ON DELETE SET NULL,
  body               TEXT         NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 500),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hand_notes_hand_id   ON hand_notes (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_notes_school_id ON hand_notes (school_id);

COMMIT;
