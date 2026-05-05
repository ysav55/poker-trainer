-- supabase/migrations/022_groups.sql
-- Creates groups and player_groups tables for CRM roster organisation.
-- Groups belong to a school (nullable = global). A player can be in many groups.

BEGIN;

CREATE TABLE IF NOT EXISTS groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 80),
  color      VARCHAR(7)  NOT NULL DEFAULT '#58a6ff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID        REFERENCES player_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS player_groups (
  player_id  UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_school_id
  ON groups(school_id);

CREATE INDEX IF NOT EXISTS idx_player_groups_group_id
  ON player_groups(group_id);

CREATE INDEX IF NOT EXISTS idx_player_groups_player_id
  ON player_groups(player_id);

-- RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_groups ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read groups (coach sees their school's groups)
CREATE POLICY "groups_select_all"
  ON groups FOR SELECT USING (true);

-- Only service role / authenticated writes (enforced at API layer via requirePermission)
CREATE POLICY "groups_insert_auth"
  ON groups FOR INSERT WITH CHECK (true);

CREATE POLICY "groups_update_auth"
  ON groups FOR UPDATE USING (true);

CREATE POLICY "groups_delete_auth"
  ON groups FOR DELETE USING (true);

CREATE POLICY "player_groups_select_all"
  ON player_groups FOR SELECT USING (true);

CREATE POLICY "player_groups_insert_auth"
  ON player_groups FOR INSERT WITH CHECK (true);

CREATE POLICY "player_groups_delete_auth"
  ON player_groups FOR DELETE USING (true);

COMMIT;
