-- Migration 007: Alpha Testing Logs
-- Structured event log for alpha-testing analysis.
-- Append-only; fire-and-forget from server — never blocks game logic.
-- Captures errors, key socket events, HTTP requests, and auth events.

BEGIN;

CREATE TABLE IF NOT EXISTS alpha_logs (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level        VARCHAR(10)  NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
  category     VARCHAR(30)  NOT NULL,  -- socket | http | game | db | auth | system
  event        VARCHAR(100) NOT NULL,  -- join_room | place_bet | db_write_failed | login_fail …
  message      TEXT,
  data         JSONB,
  table_id     VARCHAR(100),
  player_id    UUID,                   -- no FK — player may not exist yet when error fires
  session_id   UUID,
  duration_ms  INTEGER                 -- latency for http / db events
);

-- Queries the reporter runs most often
CREATE INDEX IF NOT EXISTS idx_alpha_logs_created_at  ON alpha_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_logs_level       ON alpha_logs (level);
CREATE INDEX IF NOT EXISTS idx_alpha_logs_category    ON alpha_logs (category);
CREATE INDEX IF NOT EXISTS idx_alpha_logs_event       ON alpha_logs (event);
CREATE INDEX IF NOT EXISTS idx_alpha_logs_player_id   ON alpha_logs (player_id);

-- RLS: server uses service-role key → no policies needed.
-- Disable RLS so the service role can always write/read.
ALTER TABLE alpha_logs DISABLE ROW LEVEL SECURITY;

COMMIT;
