-- Migration 032: Tournament groups — links multiple tables into one MTT event.
BEGIN;

CREATE TABLE tournament_groups (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID         REFERENCES schools(id) ON DELETE SET NULL,
  name                  TEXT         NOT NULL,
  status                TEXT         NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','running','balancing','finished')),
  shared_config         JSONB        NOT NULL DEFAULT '{}',
  -- Mirrors tournament_configs fields applied to all tables in the group
  max_players_per_table INT          NOT NULL DEFAULT 9,
  min_players_per_table INT          NOT NULL DEFAULT 3,
  is_deal               BOOLEAN      NOT NULL DEFAULT false,
  created_by            UUID         REFERENCES player_profiles(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ
);

CREATE INDEX idx_tournament_groups_status ON tournament_groups(status);
CREATE INDEX idx_tournament_groups_school ON tournament_groups(school_id);

CREATE TABLE tournament_group_standings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID         NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id        UUID         NOT NULL REFERENCES player_profiles(id),
  finish_position  INT,
  chips_at_elim    INT,
  eliminated_at    TIMESTAMPTZ,
  prize            NUMERIC      DEFAULT 0,
  UNIQUE (group_id, player_id)
);

CREATE INDEX idx_group_standings_group ON tournament_group_standings(group_id);

COMMIT;
