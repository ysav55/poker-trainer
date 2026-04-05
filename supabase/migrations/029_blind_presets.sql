-- Migration 029: Blind structure presets — school-scoped and system-wide.
BEGIN;

CREATE TABLE blind_structure_presets (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID         REFERENCES schools(id) ON DELETE CASCADE,
  -- NULL = system-wide preset available to all schools
  name         TEXT         NOT NULL,
  description  TEXT,
  levels       JSONB        NOT NULL,
  -- [{ level, sb, bb, ante, duration_minutes }, ...]
  is_system    BOOLEAN      NOT NULL DEFAULT false,
  created_by   UUID         REFERENCES player_profiles(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_blind_presets_school   ON blind_structure_presets(school_id);
CREATE INDEX idx_blind_presets_system   ON blind_structure_presets(is_system) WHERE is_system = true;

COMMIT;
