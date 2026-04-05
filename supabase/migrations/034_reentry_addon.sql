-- Migration 034: Re-entry and add-on tracking tables.
BEGIN;

CREATE TABLE tournament_reentries (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      TEXT         NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  player_id     UUID         NOT NULL REFERENCES player_profiles(id),
  reentry_count INT          NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (table_id, player_id)
);

CREATE INDEX idx_reentries_table ON tournament_reentries(table_id);

CREATE TABLE tournament_addons (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    TEXT         REFERENCES tables(id) ON DELETE CASCADE,
  group_id    UUID         REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id   UUID         NOT NULL REFERENCES player_profiles(id),
  chips_added INT          NOT NULL,
  taken_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT addon_scope_xor CHECK (
    (table_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1
  ),
  UNIQUE NULLS NOT DISTINCT (table_id, group_id, player_id)
  -- One add-on per player per tournament event.
);

CREATE INDEX idx_addons_table  ON tournament_addons(table_id);
CREATE INDEX idx_addons_group  ON tournament_addons(group_id);

COMMIT;
