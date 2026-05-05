-- Migration 018: Coach Intelligence Layer
-- Creates the five tables needed by BaselineService, AlertService,
-- SessionPrepService, and ProgressReportService, and adds quality columns to
-- the per-player session stats table.

-- ── 1. student_baselines ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_baselines (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  period_type   VARCHAR(20) NOT NULL
    CHECK (period_type IN ('rolling_30d', 'weekly', 'monthly', 'all_time')),
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  hands_played  INTEGER     NOT NULL DEFAULT 0,
  sessions      INTEGER     NOT NULL DEFAULT 0,

  -- Core stats (decimals, e.g. 0.24 = 24%)
  vpip          DECIMAL(5,4),
  pfr           DECIMAL(5,4),
  three_bet_pct DECIMAL(5,4),
  wtsd          DECIMAL(5,4),
  wsd           DECIMAL(5,4),
  aggression    DECIMAL(5,2),
  cbet_flop     DECIMAL(5,4),
  cbet_turn     DECIMAL(5,4),
  fold_to_cbet  DECIMAL(5,4),
  fold_to_probe DECIMAL(5,4),

  -- Mistake frequencies (count per 100 hands)
  open_limp_rate       DECIMAL(5,2),
  cold_call_3bet_rate  DECIMAL(5,2),
  equity_fold_rate     DECIMAL(5,2),
  overlimp_rate        DECIMAL(5,2),
  min_raise_rate       DECIMAL(5,2),

  -- Aggregate P&L
  net_chips    INTEGER      DEFAULT 0,
  bb_per_100   DECIMAL(6,2),

  -- Tag frequency profile { "3BET_POT": 42, "EQUITY_FOLD": 7, ... }
  tag_profile  JSONB,

  computed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_baselines_player_period
  ON student_baselines (player_id, period_type, period_end DESC);

-- ── 2. alert_instances ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_instances (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  player_id    UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  alert_type   VARCHAR(30) NOT NULL,
  severity     DECIMAL(3,2) NOT NULL CHECK (severity BETWEEN 0 AND 1),
  data         JSONB       NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dismissed', 'acted_on')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  acted_on_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_coach_status
  ON alert_instances (coach_id, status, severity DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_player
  ON alert_instances (player_id, created_at DESC);

-- ── 3. alert_config ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_config (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  alert_type VARCHAR(30) NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  threshold  JSONB,
  UNIQUE (coach_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_alert_config_coach
  ON alert_config (coach_id);

-- ── 4. session_prep_briefs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_prep_briefs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  player_id    UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  data         JSONB       NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefs_coach_player
  ON session_prep_briefs (coach_id, player_id, generated_at DESC);

-- ── 5. progress_reports ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  report_type   VARCHAR(20) NOT NULL
    CHECK (report_type IN ('weekly', 'monthly', 'custom')),
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  data          JSONB       NOT NULL,
  overall_grade INTEGER     CHECK (overall_grade BETWEEN 0 AND 100),
  narrative     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_id, player_id, report_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_reports_coach_player
  ON progress_reports (coach_id, player_id, created_at DESC);

-- ── 6. Alter session_player_stats (the per-player session table) ─────────────

ALTER TABLE session_player_stats
  ADD COLUMN IF NOT EXISTS quality_score     INTEGER
    CHECK (quality_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS quality_breakdown JSONB;

-- ── 7. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE student_baselines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_instances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_prep_briefs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reports      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_student_baselines_all"
  ON student_baselines FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_alert_instances_all"
  ON alert_instances FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_alert_config_all"
  ON alert_config FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_session_prep_briefs_all"
  ON session_prep_briefs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_progress_reports_all"
  ON progress_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
