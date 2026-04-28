-- Migration 045: Password reset request queue
-- Allows users to submit a reset request without email. Admins/coaches
-- see pending requests in the user management panel and reset manually.

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES player_profiles(id) ON DELETE SET NULL,

  CONSTRAINT one_pending_per_player UNIQUE (player_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Index for efficient "list all pending" queries used by admin panel
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status
  ON password_reset_requests(status, requested_at DESC);

-- RLS: only service role reads/writes (all access via Express API layer)
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
