-- supabase/migrations/013_tournament.sql
-- Migration 013: Tournament Mode — introduces tournament_configs and tournament_standings.

BEGIN;

-- ---------------------------------------------------------------------------
-- TOURNAMENT CONFIGS
-- Stores the blind schedule and config for a tournament table.
-- ---------------------------------------------------------------------------
CREATE TABLE tournament_configs (
  id               UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         TEXT       REFERENCES tables(id) ON DELETE CASCADE,
  blind_schedule   JSONB      NOT NULL DEFAULT '[]',
  -- e.g. [{"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":20}, ...]
  starting_stack   INT        NOT NULL DEFAULT 10000,
  rebuy_allowed    BOOLEAN    DEFAULT false,
  rebuy_level_cap  INT        DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TOURNAMENT STANDINGS
-- One row per (table, player) — upserted as players are eliminated.
-- ---------------------------------------------------------------------------
CREATE TABLE tournament_standings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id             TEXT        REFERENCES tables(id) ON DELETE CASCADE,
  player_id            UUID        REFERENCES player_profiles(id),
  finish_position      INT,
  chips_at_elimination INT,
  eliminated_at        TIMESTAMPTZ,
  prize                NUMERIC     DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_tournament_standings_unique
  ON tournament_standings (table_id, player_id);

CREATE INDEX idx_tournament_standings_table
  ON tournament_standings (table_id, finish_position);

COMMIT;
