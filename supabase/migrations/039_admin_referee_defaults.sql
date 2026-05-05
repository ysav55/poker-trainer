-- Migration 039: Admin-level default referee settings with optional per-school overrides.
BEGIN;

CREATE TABLE admin_referee_defaults (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  school_id   UUID         REFERENCES schools(id) ON DELETE CASCADE,
  -- NULL = applies to all open-privacy tournaments this admin creates
  -- non-NULL = applies only to tournaments in this specific school
  ref_id      UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (admin_id, school_id)
);

CREATE INDEX idx_admin_ref_defaults_admin  ON admin_referee_defaults(admin_id);
CREATE INDEX idx_admin_ref_defaults_school ON admin_referee_defaults(school_id);

COMMIT;
