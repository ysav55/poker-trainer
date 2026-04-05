-- Migration 037: Tournament referees — ad-hoc per-tournament management appointments.
BEGIN;

CREATE TABLE tournament_referees (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: exactly one of these is set
  table_id        TEXT         REFERENCES tables(id) ON DELETE CASCADE,
  group_id        UUID         REFERENCES tournament_groups(id) ON DELETE CASCADE,

  player_id       UUID         NOT NULL REFERENCES player_profiles(id),
  appointed_by    UUID         NOT NULL REFERENCES player_profiles(id),
  active          BOOLEAN      NOT NULL DEFAULT true,

  appointed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID         REFERENCES player_profiles(id),

  CONSTRAINT ref_scope_xor CHECK (
    (table_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1
  ),
  UNIQUE NULLS NOT DISTINCT (table_id, group_id, active)
  -- Max one active ref per tournament at a time.
  -- When active = false, constraint no longer blocks new appointments.
);

CREATE INDEX idx_tournament_referees_player ON tournament_referees(player_id);
CREATE INDEX idx_tournament_referees_table  ON tournament_referees(table_id);
CREATE INDEX idx_tournament_referees_group  ON tournament_referees(group_id);

COMMIT;
