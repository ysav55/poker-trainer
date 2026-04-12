-- supabase/migrations/048_tournament_group_registrations.sql
-- Registration table: one row per (group, player), tracks status and buy-in paid.

BEGIN;

CREATE TABLE tournament_group_registrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES player_profiles(id),
  status        TEXT        NOT NULL DEFAULT 'registered'
                            CHECK (status IN ('registered', 'seated', 'busted', 'cancelled')),
  buy_in_amount INTEGER     NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, player_id)
);

CREATE INDEX idx_tgr_group   ON tournament_group_registrations(group_id);
CREATE INDEX idx_tgr_player  ON tournament_group_registrations(player_id);
CREATE INDEX idx_tgr_status  ON tournament_group_registrations(group_id, status);

COMMIT;
