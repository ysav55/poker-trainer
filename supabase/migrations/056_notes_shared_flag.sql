-- Migration: Add shared_with_student flag to player_notes
-- Purpose: Enable coaches to share specific notes with students

ALTER TABLE player_notes
  ADD COLUMN shared_with_student BOOLEAN NOT NULL DEFAULT false;

-- Index for filtering shared notes when retrieving by player + shared_with_student
CREATE INDEX idx_player_notes_shared_with_student ON player_notes (player_id, shared_with_student, created_at DESC);
