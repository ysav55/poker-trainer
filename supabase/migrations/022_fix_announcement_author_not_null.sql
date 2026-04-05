-- Migration 022: Fix announcements.author_id constraint conflict
-- author_id was declared NOT NULL + ON DELETE SET NULL — contradictory.
-- If a player_profiles row is deleted, PostgreSQL tries to SET NULL but the
-- NOT NULL constraint blocks it, causing the DELETE to error.
-- Fix: drop the NOT NULL requirement so the ON DELETE SET NULL can work.

BEGIN;

ALTER TABLE announcements
  ALTER COLUMN author_id DROP NOT NULL;

COMMIT;
