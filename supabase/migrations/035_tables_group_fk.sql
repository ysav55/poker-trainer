-- Migration 035: Add tournament_group_id foreign key to tables.
BEGIN;

ALTER TABLE tables
  ADD COLUMN tournament_group_id UUID REFERENCES tournament_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_tables_tournament_group ON tables(tournament_group_id);

COMMIT;
