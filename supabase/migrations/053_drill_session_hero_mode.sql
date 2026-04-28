-- Migration 053: add hero_mode, hero_player_id, auto_advance to drill_sessions.
-- Drives the new ScenarioDealer: which player receives scenario hole cards,
-- under what cadence, and whether the table auto-advances between hands.

ALTER TABLE drill_sessions
  ADD COLUMN IF NOT EXISTS hero_mode TEXT NOT NULL DEFAULT 'sticky'
    CHECK (hero_mode IN ('sticky', 'per_hand', 'rotate')),
  ADD COLUMN IF NOT EXISTS hero_player_id UUID
    REFERENCES player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT false;
