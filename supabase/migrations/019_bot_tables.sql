-- supabase/migrations/019_bot_tables.sql
-- Migration 019: Bot Tables — supports Play vs Bot feature (Phase 1).
-- Extends the tables registry with a bot_cash mode, adds a bot_config JSONB
-- column for difficulty/seat configuration, and marks bot player profiles with
-- an is_bot flag so they are excluded from leaderboard and coaching analytics.

BEGIN;

-- ── 1. Add bot_cash to the tables mode check constraint ───────────────────────
--
-- Drop the existing CHECK constraint by name (defined in migration 010) and
-- replace it with an expanded one that includes 'bot_cash'.

ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_mode_check;

ALTER TABLE tables
  ADD CONSTRAINT tables_mode_check
    CHECK (mode IN ('coached_cash', 'uncoached_cash', 'tournament', 'bot_cash'));

-- ── 2. Add bot_config JSONB column to tables ──────────────────────────────────
--
-- Stores difficulty, human_seats, and any future bot-specific configuration.
-- NULL on non-bot tables; populated on mode=bot_cash rows.

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS bot_config JSONB DEFAULT NULL;

-- ── 3. Add is_bot flag to player_profiles ────────────────────────────────────
--
-- Bot players are server-managed socket connections. They should be excluded
-- from leaderboard, CRM, and coaching analytics queries.

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Index — fast exclusion of bot rows in leaderboard / analytics ──────────

CREATE INDEX IF NOT EXISTS idx_player_profiles_is_bot
  ON player_profiles (is_bot)
  WHERE is_bot = true;

-- ── 5. RLS — service_role retains full access ─────────────────────────────────
--
-- No new tables created; existing table RLS policies continue to apply.
-- bot_config and is_bot columns inherit the policies of their parent tables.

COMMIT;
