-- Migration 033: Expand tournament_configs with all v2 fields + grant coach tournament:manage.
BEGIN;

ALTER TABLE tournament_configs
  -- Player limits
  ADD COLUMN min_players          INT          NOT NULL DEFAULT 2,
  ADD COLUMN max_players          INT          NOT NULL DEFAULT 9,

  -- Timing
  ADD COLUMN action_time_seconds  INT          NOT NULL DEFAULT 20
                                  CHECK (action_time_seconds BETWEEN 10 AND 60),
  ADD COLUMN breaks_enabled       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN break_interval_min   INT          NOT NULL DEFAULT 55,
  ADD COLUMN break_duration_min   INT          NOT NULL DEFAULT 5,

  -- Registration
  ADD COLUMN late_reg_minutes     INT          NOT NULL DEFAULT 0,
  ADD COLUMN approval_required    BOOLEAN      NOT NULL DEFAULT false,

  -- Re-entry
  ADD COLUMN reentry_allowed      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN reentry_limit        INT          NOT NULL DEFAULT 0,
  ADD COLUMN reentry_stack        INT,
  ADD COLUMN addon_allowed        BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN addon_stack          INT,
  ADD COLUMN addon_deadline_level INT          NOT NULL DEFAULT 0,

  -- Payout
  ADD COLUMN payout_preset_id     UUID         REFERENCES payout_presets(id) ON DELETE SET NULL,
  ADD COLUMN payout_structure     JSONB,
  ADD COLUMN payout_method        TEXT         NOT NULL DEFAULT 'flat'
                                  CHECK (payout_method IN ('flat', 'icm')),
  ADD COLUMN show_icm_overlay     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN deal_threshold       INT          NOT NULL DEFAULT 0,
  ADD COLUMN is_deal              BOOLEAN      NOT NULL DEFAULT false,

  -- Multi-table link
  ADD COLUMN tournament_group_id  UUID         REFERENCES tournament_groups(id) ON DELETE SET NULL;

-- Grant tournament:manage to coach role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'coach' AND p.key = 'tournament:manage'
ON CONFLICT DO NOTHING;

COMMIT;
