-- supabase/migrations/050_bugfix_uuid_staking_notes.sql
-- Fixes C-1/C-2/C-3 (player creation 500) and adds staking_notes for W-4/W-5.

BEGIN;

-- ── 1. Fix player_profiles.id missing DEFAULT ──────────────────────────────
-- Migration 002 dropped the FK to auth.users but never added gen_random_uuid().
-- createPlayer() and registration handlers INSERT without supplying id.

ALTER TABLE player_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ── 2. Create staking_notes table ──────────────────────────────────────────
-- Free-form notes attached to a staking contract, written by the coach.

CREATE TABLE IF NOT EXISTS staking_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,
  coach_id    UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  player_id   UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_notes_contract
  ON staking_notes(contract_id, created_at DESC);

ALTER TABLE staking_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_staking_notes_all"
  ON staking_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
