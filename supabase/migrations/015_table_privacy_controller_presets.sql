-- supabase/migrations/015_table_privacy_controller_presets.sql
-- Migration 015: Table Privacy, Controller Ownership, and Table Presets.
-- Adds privacy controls, explicit controller tracking, private-table invites,
-- and a coach-owned presets store.  All changes are additive.

BEGIN;

-- ---------------------------------------------------------------------------
-- PRIVACY ENUM + COLUMN on tables
-- 'open'    — anyone with access can join (current behaviour)
-- 'school'  — only players sharing the table's school_id can join
-- 'private' — only explicitly invited players can join
-- ---------------------------------------------------------------------------
CREATE TYPE table_privacy AS ENUM ('open', 'school', 'private');

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS privacy         table_privacy NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS controller_id   UUID          REFERENCES player_profiles(id) ON DELETE SET NULL;

-- Index for lobby queries that filter by privacy
CREATE INDEX IF NOT EXISTS idx_tables_privacy ON tables (privacy);

-- ---------------------------------------------------------------------------
-- INVITED_PLAYERS
-- Whitelist for private tables. coach can add/remove entries before or after
-- the table goes live.  Unique index prevents duplicate invites.
-- ---------------------------------------------------------------------------
CREATE TABLE invited_players (
  table_id   TEXT  REFERENCES tables(id)          ON DELETE CASCADE,
  player_id  UUID  REFERENCES player_profiles(id) ON DELETE CASCADE,
  added_by   UUID  REFERENCES player_profiles(id),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, player_id)
);

CREATE INDEX idx_invited_players_table  ON invited_players (table_id);
CREATE INDEX idx_invited_players_player ON invited_players (player_id);

-- ---------------------------------------------------------------------------
-- TABLE PRESETS
-- Coach-owned snapshots of a full table configuration (blinds, mode, seats,
-- etc.).  Clone produces a new row with a new id so originals stay immutable.
-- ---------------------------------------------------------------------------
CREATE TABLE table_presets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  config     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_table_presets_coach ON table_presets (coach_id, created_at DESC);

COMMIT;
