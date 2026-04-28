-- supabase/migrations/020_standalone_tournaments.sql
-- Migration 020: Standalone Tournament Management (POK-95)
-- Adds first-class tournament entities independent of the table-scoped system.

BEGIN;

-- ---------------------------------------------------------------------------
-- TOURNAMENTS
-- First-class tournament entity with lifecycle status and blind structure.
-- ---------------------------------------------------------------------------
CREATE TABLE tournaments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT         NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','running','paused','finished')),
  blind_structure     JSONB        NOT NULL DEFAULT '[]',
  -- e.g. [{"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":20}, ...]
  current_level_index INT          NOT NULL DEFAULT 0,
  starting_stack      INT          NOT NULL DEFAULT 10000,
  rebuy_allowed       BOOLEAN      NOT NULL DEFAULT false,
  addon_allowed       BOOLEAN      NOT NULL DEFAULT false,
  created_by          UUID         REFERENCES player_profiles(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ
);

CREATE INDEX idx_tournaments_status     ON tournaments (status);
CREATE INDEX idx_tournaments_created_at ON tournaments (created_at DESC);

-- ---------------------------------------------------------------------------
-- TOURNAMENT_PLAYERS
-- One row per (tournament, player). Tracks chip count and elimination state.
-- ---------------------------------------------------------------------------
CREATE TABLE tournament_players (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id        UUID         NOT NULL REFERENCES player_profiles(id),
  chip_count       INT          NOT NULL DEFAULT 0,
  is_eliminated    BOOLEAN      NOT NULL DEFAULT false,
  finish_position  INT,
  registered_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tournament_players_unique
  ON tournament_players (tournament_id, player_id);

CREATE INDEX idx_tournament_players_tournament
  ON tournament_players (tournament_id);

COMMIT;
