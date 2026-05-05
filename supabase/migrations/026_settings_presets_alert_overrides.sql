-- Migration 026: alert_config per-player/per-school override support
-- table_presets already exists in DB (created earlier); this migration
-- only extends alert_config to support per-player and per-school overrides.
-- Additive only — no breaking changes to existing data.

-- Add override columns to alert_config
ALTER TABLE alert_config
  ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'default'
    CHECK (target_type IN ('default', 'player', 'school')),
  ADD COLUMN IF NOT EXISTS target_id UUID;

-- Backfill: ensure all existing rows are marked as 'default'
UPDATE alert_config SET target_type = 'default' WHERE target_type IS NULL;

-- Drop old two-column unique constraint (blocks adding per-player rows for same alert_type)
ALTER TABLE alert_config
  DROP CONSTRAINT IF EXISTS alert_config_coach_id_alert_type_key;

-- Unique index for coach-wide defaults (one row per coach+alert_type)
CREATE UNIQUE INDEX IF NOT EXISTS alert_config_default_unique
  ON alert_config (coach_id, alert_type)
  WHERE target_type = 'default';

-- Unique index for per-target overrides (one row per coach+alert_type+target)
CREATE UNIQUE INDEX IF NOT EXISTS alert_config_override_unique
  ON alert_config (coach_id, alert_type, target_id)
  WHERE target_type != 'default';
