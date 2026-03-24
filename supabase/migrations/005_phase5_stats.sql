-- =============================================================================
-- Migration 005: Phase 5 — Player Stats Hover Cards
-- Adds: stack_adjustments table, three_bet tracking, drops leaderboard_view,
--       updates both trigger functions, adds missing anon read policies.
-- =============================================================================

-- ── stack_adjustments ────────────────────────────────────────────────────────
-- Audit log for coach-issued stack adjustments (restocks).
CREATE TABLE IF NOT EXISTS stack_adjustments (
  id         bigserial   PRIMARY KEY,
  session_id uuid        NOT NULL REFERENCES sessions ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES player_profiles ON DELETE CASCADE,
  amount     int         NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_adj_session ON stack_adjustments (session_id);
CREATE INDEX IF NOT EXISTS idx_stack_adj_player  ON stack_adjustments (player_id);

ALTER TABLE stack_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY stack_adj_anon_read ON stack_adjustments FOR SELECT USING (true);

-- ── hand_players: add three_bet ───────────────────────────────────────────────
ALTER TABLE hand_players
  ADD COLUMN IF NOT EXISTS three_bet boolean NOT NULL DEFAULT false;

-- ── leaderboard: add three_bet_count + drop view ─────────────────────────────
ALTER TABLE leaderboard
  ADD COLUMN IF NOT EXISTS three_bet_count int NOT NULL DEFAULT 0;

DROP VIEW IF EXISTS leaderboard_view;

-- ── session_player_stats: add three_bet_count + anon read ────────────────────
ALTER TABLE session_player_stats
  ADD COLUMN IF NOT EXISTS three_bet_count int NOT NULL DEFAULT 0;

-- session_player_stats was missing from 003 anon read policies
CREATE POLICY sps_anon_read ON session_player_stats FOR SELECT USING (true);

-- ── Update refresh_leaderboard_row() to include three_bet_count ──────────────
CREATE OR REPLACE FUNCTION refresh_leaderboard_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO leaderboard (player_id, display_name, total_hands, total_wins,
    net_chips, vpip_count, pfr_count, wtsd_count, wsd_count, three_bet_count,
    last_hand_at, updated_at)
  SELECT
    hp.player_id,
    pp.display_name,
    COUNT(*)                                                        AS total_hands,
    COUNT(*) FILTER (WHERE hp.is_winner)                            AS total_wins,
    COALESCE(SUM(COALESCE(hp.stack_end, 0) - hp.stack_start), 0)   AS net_chips,
    COUNT(*) FILTER (WHERE hp.vpip)                                 AS vpip_count,
    COUNT(*) FILTER (WHERE hp.pfr)                                  AS pfr_count,
    COUNT(*) FILTER (WHERE hp.wtsd)                                 AS wtsd_count,
    COUNT(*) FILTER (WHERE hp.wsd)                                  AS wsd_count,
    COUNT(*) FILTER (WHERE hp.three_bet)                            AS three_bet_count,
    MAX(h.started_at)                                               AS last_hand_at,
    now()                                                           AS updated_at
  FROM hand_players hp
  JOIN hands          h  ON h.hand_id   = hp.hand_id
  JOIN player_profiles pp ON pp.id      = hp.player_id
  WHERE hp.player_id = NEW.player_id
    AND h.completed_normally = true
  GROUP BY hp.player_id, pp.display_name
  ON CONFLICT (player_id) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    total_hands     = EXCLUDED.total_hands,
    total_wins      = EXCLUDED.total_wins,
    net_chips       = EXCLUDED.net_chips,
    vpip_count      = EXCLUDED.vpip_count,
    pfr_count       = EXCLUDED.pfr_count,
    wtsd_count      = EXCLUDED.wtsd_count,
    wsd_count       = EXCLUDED.wsd_count,
    three_bet_count = EXCLUDED.three_bet_count,
    last_hand_at    = EXCLUDED.last_hand_at,
    updated_at      = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

-- ── Update refresh_session_stats_row() to include three_bet_count ────────────
CREATE OR REPLACE FUNCTION refresh_session_stats_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_session_id uuid;
BEGIN
  SELECT h.session_id INTO v_session_id
  FROM hands h WHERE h.hand_id = NEW.hand_id;

  IF v_session_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO session_player_stats
    (session_id, player_id, display_name, hands_played, hands_won, net_chips,
     vpip_count, pfr_count, wtsd_count, wsd_count, three_bet_count, updated_at)
  SELECT
    v_session_id,
    hp.player_id,
    pp.display_name,
    COUNT(*)                                                        AS hands_played,
    COUNT(*) FILTER (WHERE hp.is_winner)                            AS hands_won,
    COALESCE(SUM(COALESCE(hp.stack_end, 0) - hp.stack_start), 0)   AS net_chips,
    COUNT(*) FILTER (WHERE hp.vpip)                                 AS vpip_count,
    COUNT(*) FILTER (WHERE hp.pfr)                                  AS pfr_count,
    COUNT(*) FILTER (WHERE hp.wtsd)                                 AS wtsd_count,
    COUNT(*) FILTER (WHERE hp.wsd)                                  AS wsd_count,
    COUNT(*) FILTER (WHERE hp.three_bet)                            AS three_bet_count,
    now()
  FROM hand_players hp
  JOIN hands          h  ON h.hand_id   = hp.hand_id
  JOIN player_profiles pp ON pp.id      = hp.player_id
  WHERE hp.player_id = NEW.player_id
    AND h.session_id = v_session_id
  GROUP BY hp.player_id, pp.display_name
  ON CONFLICT (session_id, player_id) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    hands_played    = EXCLUDED.hands_played,
    hands_won       = EXCLUDED.hands_won,
    net_chips       = EXCLUDED.net_chips,
    vpip_count      = EXCLUDED.vpip_count,
    pfr_count       = EXCLUDED.pfr_count,
    wtsd_count      = EXCLUDED.wtsd_count,
    wsd_count       = EXCLUDED.wsd_count,
    three_bet_count = EXCLUDED.three_bet_count,
    updated_at      = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;
