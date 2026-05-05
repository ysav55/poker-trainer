-- Migration 030: Payout structure presets — school-scoped and system-wide.
BEGIN;

CREATE TABLE payout_presets (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID         REFERENCES schools(id) ON DELETE CASCADE,
  -- NULL = system-wide
  name        TEXT         NOT NULL,
  tiers       JSONB        NOT NULL,
  -- [{ min_entrants, max_entrants, payouts: [{ position, percentage }] }]
  -- percentages within a tier must sum to 100
  is_system   BOOLEAN      NOT NULL DEFAULT false,
  created_by  UUID         REFERENCES player_profiles(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_payout_presets_school ON payout_presets(school_id);
CREATE INDEX idx_payout_presets_system ON payout_presets(is_system) WHERE is_system = true;

COMMIT;
