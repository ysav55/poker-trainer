-- supabase/migrations/010_tables_registry.sql
-- Migration 010: Tables Registry — introduces a first-class `tables` table.
-- Adds a poker table registry that the multi-table architecture (Phase 2) builds on.
-- Back-fills a 'main-table' seed row so the NOT VALID FK on sessions doesn't block
-- any pre-existing rows whose table_id was never stored in a registry.

BEGIN;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE tables (
  id            TEXT         PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  mode          VARCHAR(30)  NOT NULL DEFAULT 'coached_cash'
    CHECK (mode IN ('coached_cash', 'uncoached_cash', 'tournament')),
  status        VARCHAR(20)  NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('scheduled', 'waiting', 'active', 'paused', 'completed')),
  config        JSONB        DEFAULT '{}',
  created_by    UUID         REFERENCES player_profiles(id),
  scheduled_for TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT now(),
  closed_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Indexes — optimise lobby queries (non-completed tables, scheduled look-ahead)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_tables_status
  ON tables (status)
  WHERE status != 'completed';

CREATE INDEX idx_tables_scheduled_for
  ON tables (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SEED: legacy 'main-table' row
-- Every session recorded before this migration used table_id = 'main-table'.
-- Inserting it here satisfies the NOT VALID FK added below so that future
-- sessions referencing 'main-table' are also properly FK-enforced.
-- ---------------------------------------------------------------------------
INSERT INTO tables (id, name, status)
VALUES ('main-table', 'Main Table', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- FK: sessions → tables
--
-- NOT VALID is intentional: it skips scanning the existing sessions rows
-- (which all have table_id = 'main-table', now covered by the seed above).
-- New sessions written after this migration *will* be FK-enforced immediately.
-- Run  ALTER TABLE sessions VALIDATE CONSTRAINT fk_sessions_table;
-- after confirming the seed row is in place if you want full historical
-- validation (safe to run online — it only acquires ShareUpdateExclusiveLock).
-- ---------------------------------------------------------------------------
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_table
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
  NOT VALID;

COMMIT;
