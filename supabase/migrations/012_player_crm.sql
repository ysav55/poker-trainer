-- supabase/migrations/012_player_crm.sql
-- Migration 012: Player CRM — adds coach notes, player labels, coaching sessions,
-- and weekly performance snapshots for the Player CRM feature (Phase 2, Item 8).

BEGIN;

-- ---------------------------------------------------------------------------
-- PLAYER NOTES
-- Free-form coach notes attached to a player. Multiple note types allow
-- categorisation for quick filtering in the CRM UI.
-- ---------------------------------------------------------------------------
CREATE TABLE player_notes (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID         REFERENCES player_profiles(id) ON DELETE CASCADE,
  coach_id   UUID         REFERENCES player_profiles(id),
  content    TEXT         NOT NULL,
  note_type  VARCHAR(30)  DEFAULT 'general'
    CHECK (note_type IN ('general', 'session_review', 'goal', 'weakness')),
  created_at TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX idx_player_notes_player
  ON player_notes (player_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- PLAYER TAGS
-- Freeform labels a coach assigns to a player (e.g. "passive postflop",
-- "strong 3bet"). Composite PK prevents duplicates.
-- ---------------------------------------------------------------------------
CREATE TABLE player_tags (
  player_id   UUID         REFERENCES player_profiles(id) ON DELETE CASCADE,
  tag         VARCHAR(50)  NOT NULL,
  assigned_by UUID         REFERENCES player_profiles(id),
  assigned_at TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (player_id, tag)
);

-- ---------------------------------------------------------------------------
-- COACHING SESSIONS
-- Scheduled or completed one-on-one coaching slots.
-- ---------------------------------------------------------------------------
CREATE TABLE coaching_sessions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID         REFERENCES player_profiles(id) ON DELETE CASCADE,
  coach_id         UUID         REFERENCES player_profiles(id),
  scheduled_at     TIMESTAMPTZ  NOT NULL,
  duration_minutes INT          DEFAULT 60,
  status           VARCHAR(20)  DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX idx_coaching_sessions_player
  ON coaching_sessions (player_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- PLAYER PERFORMANCE SNAPSHOTS
-- Weekly aggregate snapshot produced by the Sunday cron job.
-- UNIQUE (player_id, period_start) enables ON CONFLICT upserts.
-- ---------------------------------------------------------------------------
CREATE TABLE player_performance_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID          REFERENCES player_profiles(id) ON DELETE CASCADE,
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,
  hands_played          INT,
  net_chips             BIGINT,
  vpip_pct              NUMERIC(5,2),
  pfr_pct               NUMERIC(5,2),
  wtsd_pct              NUMERIC(5,2),
  wsd_pct               NUMERIC(5,2),
  three_bet_pct         NUMERIC(5,2),
  avg_decision_time_ms  INT,
  most_common_mistakes  TEXT[],
  created_at            TIMESTAMPTZ   DEFAULT now(),
  UNIQUE (player_id, period_start)
);

COMMIT;
