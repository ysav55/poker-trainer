-- supabase/migrations/011_scenario_configs.sql
-- Migration 011: Scenario Configs — persisted scenario/drill configurations
-- that can be saved to playlists and replayed by the coach.

BEGIN;

-- ---------------------------------------------------------------------------
-- SCENARIO_CONFIGS
-- ---------------------------------------------------------------------------
CREATE TABLE scenario_configs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         TEXT         REFERENCES tables(id) ON DELETE SET NULL,
  name             TEXT,
  created_by       UUID         REFERENCES player_profiles(id),
  player_count     INT          NOT NULL CHECK (player_count BETWEEN 2 AND 9),
  dealer_position  INT          NOT NULL DEFAULT 0,
  starting_street  VARCHAR(10)  NOT NULL DEFAULT 'preflop'
                                CHECK (starting_street IN ('preflop', 'flop', 'turn', 'river')),
  small_blind      INT          NOT NULL DEFAULT 25,
  big_blind        INT          NOT NULL DEFAULT 50,
  config_json      JSONB        NOT NULL,
  created_at       TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX idx_scenario_configs_created_by
  ON scenario_configs (created_by);

CREATE INDEX idx_scenario_configs_table_id
  ON scenario_configs (table_id)
  WHERE table_id IS NOT NULL;

CREATE INDEX idx_scenario_configs_created_at
  ON scenario_configs (created_at DESC);

-- ---------------------------------------------------------------------------
-- PLAYLIST_HANDS: add nullable FK to scenario_configs
-- ---------------------------------------------------------------------------
ALTER TABLE playlist_hands
  ADD COLUMN IF NOT EXISTS scenario_config_id UUID
    REFERENCES scenario_configs(id) ON DELETE SET NULL;

COMMIT;
