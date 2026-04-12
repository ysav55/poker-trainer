-- Migration 041: Add table_mode column to hands table
-- Records which game mode a hand was played in for analytics and filtering.
-- NULL is valid for historical hands that predate this column.

ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS table_mode TEXT
  CHECK (table_mode IN ('coached_cash', 'uncoached_cash', 'tournament', 'bot_cash'));
