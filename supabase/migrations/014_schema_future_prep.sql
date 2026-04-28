-- supabase/migrations/014_schema_future_prep.sql
-- Migration 014: Schema Future-Prep — forward-looking hooks for multi-school,
-- org settings, scenario marketplace, and audit trail columns.
-- All changes are additive (nullable FKs, new tables) — zero breaking changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- SCHOOLS
-- One school per org/franchise. A single 'Default School' seed row covers all
-- existing tables/players until multi-school support is wired in the UI.
-- All FKs added below are nullable so existing data is unaffected.
-- ---------------------------------------------------------------------------
CREATE TABLE schools (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  logo_url      TEXT,
  primary_color VARCHAR(7),                  -- hex e.g. '#1a2b3c'
  theme         JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default school with a stable, well-known UUID so application code
-- can reference it before real schools are created.
INSERT INTO schools (id, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Default School')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- school_id FK on major tables (nullable — existing rows get NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE scenario_configs
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- AUDIT COLUMNS
-- Add updated_by where only created_by existed.
-- Add both created_by + updated_by to tables that had neither.
-- ---------------------------------------------------------------------------

-- player_profiles: created_by added in migration 009
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- tables: created_by added in migration 010
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- playlists: created_by added in migration 001
ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- scenario_configs: created_by added in migration 011
ALTER TABLE scenario_configs
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- hands: no audit columns before this migration
ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES player_profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- sessions: no audit columns before this migration
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES player_profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES player_profiles(id);

-- ---------------------------------------------------------------------------
-- SETTINGS
-- Generic scoped key/value store.
-- scope_id points to the owning entity's PK (school.id, player_profiles.id,
-- tables.id) or is NULL for org-level settings.
-- UNIQUE on (scope, scope_id, key) enables safe upserts.
-- ---------------------------------------------------------------------------
CREATE TYPE settings_scope AS ENUM ('org', 'school', 'coach', 'table');

CREATE TABLE settings (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      settings_scope NOT NULL,
  scope_id   UUID,          -- NULL = org-level
  key        TEXT           NOT NULL,
  value      JSONB          NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, key)
);

CREATE INDEX idx_settings_lookup ON settings (scope, scope_id);

-- ---------------------------------------------------------------------------
-- SCENARIO MARKETPLACE FIELDS
-- owner_id: coach who owns the scenario (can differ from created_by after
--           transfer). is_shareable: opt-in flag for a future marketplace.
-- ---------------------------------------------------------------------------
ALTER TABLE scenario_configs
  ADD COLUMN IF NOT EXISTS owner_id     UUID    REFERENCES player_profiles(id),
  ADD COLUMN IF NOT EXISTS is_shareable BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- REFERRAL CODE
-- Unused for now; reserved for a coach referral / affiliate programme.
-- Unique partial index keeps it optional but non-colliding.
-- ---------------------------------------------------------------------------
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(40);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_referral_code
  ON player_profiles (referral_code)
  WHERE referral_code IS NOT NULL;

COMMIT;
