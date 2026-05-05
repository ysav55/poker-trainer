-- Migration 040: Tournament Bridge
-- Links the standalone tournaments table (System B registry) to the
-- table-based tournament system (System A game engine) via a table_id FK.
-- Also adds scheduled_start_at and min_players to both sides.

BEGIN;

-- ── tournaments table additions ───────────────────────────────────────────────

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS table_id            TEXT        REFERENCES tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_start_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS min_players         INT         NOT NULL DEFAULT 6;

CREATE INDEX IF NOT EXISTS idx_tournaments_table_id ON tournaments (table_id);

-- ── tournament_configs additions ──────────────────────────────────────────────
-- Mirrors scheduled_start_at so TournamentController can read it from config.

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS scheduled_start_at  TIMESTAMPTZ;

COMMIT;
