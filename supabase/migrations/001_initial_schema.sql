-- =============================================================================
-- Poker Trainer — Initial Supabase Schema
-- Migration 001: Full schema (replaces SQLite poker_trainer.sqlite)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fast ILIKE / trigram search
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- accent-insensitive name matching
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Collation: case-insensitive text matching for display names
-- ---------------------------------------------------------------------------
CREATE COLLATION IF NOT EXISTS case_insensitive (
  provider = icu,
  locale   = 'und-u-ks-level2',
  deterministic = false
);

-- =============================================================================
-- PLAYER PROFILES
-- Replaces player_identities. Links to Supabase auth.users.
-- =============================================================================
CREATE TABLE IF NOT EXISTS player_profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name  text        COLLATE case_insensitive UNIQUE NOT NULL,
  is_coach      boolean     NOT NULL DEFAULT false,
  is_roster     boolean     NOT NULL DEFAULT false,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_name ON player_profiles (display_name);

-- =============================================================================
-- SESSIONS
-- One session = one coach bringing players to a table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  session_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      text        NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,                          -- set when session ends
  player_count  int,                                  -- snapshot at session start
  session_type  text        CHECK (session_type IN ('live','drill','replay')),
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_table    ON sessions (table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started  ON sessions (started_at DESC);

-- =============================================================================
-- HANDS
-- One row per hand dealt. Tags moved to hand_tags junction table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS hands (
  hand_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid        NOT NULL REFERENCES sessions ON DELETE CASCADE,
  table_id           text        NOT NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  board              text[]      NOT NULL DEFAULT '{}',   -- e.g. {'Ah','Kd','2c','7s','Jh'}
  final_pot          int         NOT NULL DEFAULT 0,
  winner_id          uuid        REFERENCES player_profiles,
  winner_name        text,
  phase_ended        text,                               -- 'showdown' | 'fold_to_one' | 'waiting' etc.
  completed_normally boolean     NOT NULL DEFAULT false,
  dealer_seat        int         NOT NULL DEFAULT 0,
  is_scenario_hand   boolean     NOT NULL DEFAULT false,
  small_blind        int         NOT NULL DEFAULT 0,
  big_blind          int         NOT NULL DEFAULT 0,
  session_type       text        CHECK (session_type IN ('live','drill','replay'))
);

CREATE INDEX IF NOT EXISTS idx_hands_session  ON hands (session_id);
CREATE INDEX IF NOT EXISTS idx_hands_table    ON hands (table_id);
CREATE INDEX IF NOT EXISTS idx_hands_started  ON hands (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hands_winner   ON hands (winner_id);

-- =============================================================================
-- HAND TAGS
-- Replaces the three JSON text columns (auto_tags, mistake_tags, coach_tags).
-- Enables: SELECT * FROM hands WHERE id IN (SELECT hand_id FROM hand_tags WHERE tag = 'C_BET')
-- =============================================================================
CREATE TABLE IF NOT EXISTS hand_tags (
  id         bigserial   PRIMARY KEY,
  hand_id    uuid        NOT NULL REFERENCES hands ON DELETE CASCADE,
  tag        text        NOT NULL,
  tag_type   text        NOT NULL CHECK (tag_type IN ('auto','mistake','coach')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hand_id, tag, tag_type)
);

CREATE INDEX IF NOT EXISTS idx_hand_tags_hand     ON hand_tags (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_tags_tag      ON hand_tags (tag);
CREATE INDEX IF NOT EXISTS idx_hand_tags_type     ON hand_tags (tag_type);
CREATE INDEX IF NOT EXISTS idx_hand_tags_hand_type ON hand_tags (hand_id, tag_type);

-- =============================================================================
-- HAND PLAYERS
-- One row per (hand, player). Stats flags are booleans.
-- =============================================================================
CREATE TABLE IF NOT EXISTS hand_players (
  hand_id              uuid        NOT NULL REFERENCES hands ON DELETE CASCADE,
  player_id            uuid        NOT NULL REFERENCES player_profiles,
  player_name          text        NOT NULL,
  seat                 int,
  position             text        CHECK (position IN ('UTG','UTG+1','HJ','CO','BTN','SB','BB')),
  stack_start          int         NOT NULL DEFAULT 0,
  stack_end            int,
  hole_cards           text[]      NOT NULL DEFAULT '{}',  -- e.g. {'As','Kh'}
  is_winner            boolean     NOT NULL DEFAULT false,
  vpip                 boolean     NOT NULL DEFAULT false,
  pfr                  boolean     NOT NULL DEFAULT false,
  wtsd                 boolean     NOT NULL DEFAULT false,
  wsd                  boolean     NOT NULL DEFAULT false,
  decision_time_avg_ms int,                               -- avg ms per action this hand
  PRIMARY KEY (hand_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_hand_players_hand   ON hand_players (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_players_player ON hand_players (player_id);
CREATE INDEX IF NOT EXISTS idx_hand_players_pos    ON hand_players (position);

-- =============================================================================
-- HAND ACTIONS
-- Every bet/fold/check/raise. Enriched with stack + pot context.
-- =============================================================================
CREATE TABLE IF NOT EXISTS hand_actions (
  id                  bigserial   PRIMARY KEY,
  hand_id             uuid        NOT NULL REFERENCES hands ON DELETE CASCADE,
  player_id           uuid        NOT NULL REFERENCES player_profiles,
  player_name         text        NOT NULL,
  street              text        NOT NULL CHECK (street IN ('preflop','flop','turn','river')),
  action              text        NOT NULL,
  amount              int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  is_manual_scenario  boolean     NOT NULL DEFAULT false,
  is_reverted         boolean     NOT NULL DEFAULT false,
  stack_at_action     int,        -- player's stack when action was taken
  pot_at_action       int,        -- pot size when action was taken
  decision_time_ms    int         -- ms from action_timer start to action submitted
);

CREATE INDEX IF NOT EXISTS idx_hand_actions_hand   ON hand_actions (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_actions_player ON hand_actions (player_id);
CREATE INDEX IF NOT EXISTS idx_hand_actions_street ON hand_actions (hand_id, street);

-- =============================================================================
-- PLAYLISTS
-- Named collections of hands for drills / review.
-- =============================================================================
CREATE TABLE IF NOT EXISTS playlists (
  playlist_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  table_id     text,
  created_by   uuid        REFERENCES player_profiles,
  created_at   timestamptz NOT NULL DEFAULT now(),
  is_public    boolean     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_playlists_table     ON playlists (table_id);
CREATE INDEX IF NOT EXISTS idx_playlists_created   ON playlists (created_at DESC);

-- =============================================================================
-- PLAYLIST HANDS
-- Junction table: ordered hand list per playlist.
-- =============================================================================
CREATE TABLE IF NOT EXISTS playlist_hands (
  playlist_id    uuid        NOT NULL REFERENCES playlists ON DELETE CASCADE,
  hand_id        uuid        NOT NULL REFERENCES hands     ON DELETE CASCADE,
  display_order  int         NOT NULL DEFAULT 0,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, hand_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_hands_playlist ON playlist_hands (playlist_id, display_order);

-- =============================================================================
-- SESSION PLAYER STATS
-- Denormalized per-(session, player) counters.
-- Updated by trigger after every hand_players row insert/update.
-- Replaces the expensive aggregation in getSessionStats().
-- =============================================================================
CREATE TABLE IF NOT EXISTS session_player_stats (
  session_id    uuid        NOT NULL REFERENCES sessions ON DELETE CASCADE,
  player_id     uuid        NOT NULL REFERENCES player_profiles,
  display_name  text        NOT NULL,
  hands_played  int         NOT NULL DEFAULT 0,
  hands_won     int         NOT NULL DEFAULT 0,
  net_chips     int         NOT NULL DEFAULT 0,
  vpip_count    int         NOT NULL DEFAULT 0,
  pfr_count     int         NOT NULL DEFAULT 0,
  wtsd_count    int         NOT NULL DEFAULT 0,
  wsd_count     int         NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_sps_session ON session_player_stats (session_id);
CREATE INDEX IF NOT EXISTS idx_sps_player  ON session_player_stats (player_id);

-- =============================================================================
-- LEADERBOARD
-- All-time per-player stats. Trigger-maintained after every hand_players upsert.
-- Replaces the full-table aggregation query in getAllPlayersWithStats().
-- =============================================================================
CREATE TABLE IF NOT EXISTS leaderboard (
  player_id     uuid        PRIMARY KEY REFERENCES player_profiles ON DELETE CASCADE,
  display_name  text        NOT NULL,
  total_hands   int         NOT NULL DEFAULT 0,
  total_wins    int         NOT NULL DEFAULT 0,
  net_chips     int         NOT NULL DEFAULT 0,
  vpip_count    int         NOT NULL DEFAULT 0,
  pfr_count     int         NOT NULL DEFAULT 0,
  wtsd_count    int         NOT NULL DEFAULT 0,
  wsd_count     int         NOT NULL DEFAULT 0,
  last_hand_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Computed columns exposed as a view for the API
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  l.player_id,
  l.display_name,
  l.total_hands,
  l.total_wins,
  l.net_chips,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.vpip_count::numeric  / l.total_hands * 100, 1) ELSE 0 END AS vpip_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.pfr_count::numeric   / l.total_hands * 100, 1) ELSE 0 END AS pfr_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.wtsd_count::numeric  / l.total_hands * 100, 1) ELSE 0 END AS wtsd_pct,
  CASE WHEN l.wtsd_count   > 0 THEN ROUND(l.wsd_count::numeric   / l.wtsd_count  * 100, 1) ELSE 0 END AS wsd_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.total_wins::numeric  / l.total_hands * 100, 1) ELSE 0 END AS win_pct,
  l.last_hand_at,
  l.updated_at
FROM leaderboard l;

-- =============================================================================
-- TRIGGER: maintain leaderboard after hand_players insert/update
-- =============================================================================
CREATE OR REPLACE FUNCTION refresh_leaderboard_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO leaderboard (player_id, display_name, total_hands, total_wins,
    net_chips, vpip_count, pfr_count, wtsd_count, wsd_count, last_hand_at, updated_at)
  SELECT
    hp.player_id,
    pp.display_name,
    COUNT(*)                                           AS total_hands,
    COUNT(*) FILTER (WHERE hp.is_winner)               AS total_wins,
    COALESCE(SUM(COALESCE(hp.stack_end,0) - hp.stack_start), 0) AS net_chips,
    COUNT(*) FILTER (WHERE hp.vpip)                    AS vpip_count,
    COUNT(*) FILTER (WHERE hp.pfr)                     AS pfr_count,
    COUNT(*) FILTER (WHERE hp.wtsd)                    AS wtsd_count,
    COUNT(*) FILTER (WHERE hp.wsd)                     AS wsd_count,
    MAX(h.started_at)                                  AS last_hand_at,
    now()                                              AS updated_at
  FROM hand_players hp
  JOIN hands         h  ON h.hand_id    = hp.hand_id
  JOIN player_profiles pp ON pp.id      = hp.player_id
  WHERE hp.player_id = NEW.player_id
    AND h.completed_normally = true
  GROUP BY hp.player_id, pp.display_name
  ON CONFLICT (player_id) DO UPDATE SET
    display_name  = EXCLUDED.display_name,
    total_hands   = EXCLUDED.total_hands,
    total_wins    = EXCLUDED.total_wins,
    net_chips     = EXCLUDED.net_chips,
    vpip_count    = EXCLUDED.vpip_count,
    pfr_count     = EXCLUDED.pfr_count,
    wtsd_count    = EXCLUDED.wtsd_count,
    wsd_count     = EXCLUDED.wsd_count,
    last_hand_at  = EXCLUDED.last_hand_at,
    updated_at    = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_leaderboard_after_hand_player
  AFTER INSERT OR UPDATE ON hand_players
  FOR EACH ROW EXECUTE FUNCTION refresh_leaderboard_row();

-- =============================================================================
-- TRIGGER: maintain session_player_stats after hand_players insert/update
-- =============================================================================
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
     vpip_count, pfr_count, wtsd_count, wsd_count, updated_at)
  SELECT
    v_session_id,
    hp.player_id,
    pp.display_name,
    COUNT(*)                                           AS hands_played,
    COUNT(*) FILTER (WHERE hp.is_winner)               AS hands_won,
    COALESCE(SUM(COALESCE(hp.stack_end,0) - hp.stack_start), 0) AS net_chips,
    COUNT(*) FILTER (WHERE hp.vpip)                    AS vpip_count,
    COUNT(*) FILTER (WHERE hp.pfr)                     AS pfr_count,
    COUNT(*) FILTER (WHERE hp.wtsd)                    AS wtsd_count,
    COUNT(*) FILTER (WHERE hp.wsd)                     AS wsd_count,
    now()
  FROM hand_players hp
  JOIN hands          h  ON h.hand_id    = hp.hand_id
  JOIN player_profiles pp ON pp.id       = hp.player_id
  WHERE hp.player_id = NEW.player_id
    AND h.session_id = v_session_id
  GROUP BY hp.player_id, pp.display_name
  ON CONFLICT (session_id, player_id) DO UPDATE SET
    display_name  = EXCLUDED.display_name,
    hands_played  = EXCLUDED.hands_played,
    hands_won     = EXCLUDED.hands_won,
    net_chips     = EXCLUDED.net_chips,
    vpip_count    = EXCLUDED.vpip_count,
    pfr_count     = EXCLUDED.pfr_count,
    wtsd_count    = EXCLUDED.wtsd_count,
    wsd_count     = EXCLUDED.wsd_count,
    updated_at    = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_session_stats_after_hand_player
  AFTER INSERT OR UPDATE ON hand_players
  FOR EACH ROW EXECUTE FUNCTION refresh_session_stats_row();

-- =============================================================================
-- HELPER FUNCTION: derive position label from seat + dealer seat + player count
-- Used in HandLogger equivalent when writing hand_players rows.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_position(
  p_seat         int,
  p_dealer_seat  int,
  p_player_count int
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  rel int;
BEGIN
  IF p_player_count IS NULL OR p_player_count < 2 THEN RETURN NULL; END IF;
  rel := ((p_seat - p_dealer_seat - 1) % p_player_count + p_player_count) % p_player_count;
  RETURN CASE rel
    WHEN 0 THEN 'SB'
    WHEN 1 THEN 'BB'
    WHEN p_player_count - 1 THEN 'BTN'
    WHEN p_player_count - 2 THEN 'CO'
    WHEN p_player_count - 3 THEN 'HJ'
    ELSE 'UTG'
  END;
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all user-data tables
ALTER TABLE player_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hands               ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_hands      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard         ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a coach?
CREATE OR REPLACE FUNCTION is_coach() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT is_coach FROM player_profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- player_profiles: everyone sees their own row; coach sees all
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_own   ON player_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_select_coach ON player_profiles FOR SELECT USING (is_coach());
CREATE POLICY profiles_update_own   ON player_profiles FOR UPDATE USING (id = auth.uid());

-- ---------------------------------------------------------------------------
-- sessions: coach sees all; players see sessions they participated in
-- ---------------------------------------------------------------------------
CREATE POLICY sessions_coach ON sessions FOR SELECT USING (is_coach());
CREATE POLICY sessions_player ON sessions FOR SELECT USING (
  session_id IN (
    SELECT DISTINCT h.session_id FROM hands h
    JOIN hand_players hp ON hp.hand_id = h.hand_id
    WHERE hp.player_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- hands: coach sees all; players see hands they played in
-- ---------------------------------------------------------------------------
CREATE POLICY hands_coach  ON hands FOR SELECT USING (is_coach());
CREATE POLICY hands_player ON hands FOR SELECT USING (
  hand_id IN (SELECT hand_id FROM hand_players WHERE player_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- hand_players: coach sees all; players see only own rows
-- ---------------------------------------------------------------------------
CREATE POLICY hp_coach  ON hand_players FOR SELECT USING (is_coach());
CREATE POLICY hp_player ON hand_players FOR SELECT USING (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- hand_actions: coach sees all; players see actions from their own hands
-- ---------------------------------------------------------------------------
CREATE POLICY ha_coach  ON hand_actions FOR SELECT USING (is_coach());
CREATE POLICY ha_player ON hand_actions FOR SELECT USING (
  hand_id IN (SELECT hand_id FROM hand_players WHERE player_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- hand_tags: coach sees all; players see tags for their own hands
-- ---------------------------------------------------------------------------
CREATE POLICY ht_coach  ON hand_tags FOR SELECT USING (is_coach());
CREATE POLICY ht_player ON hand_tags FOR SELECT USING (
  hand_id IN (SELECT hand_id FROM hand_players WHERE player_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- leaderboard: all authenticated users can read (it's a public standings board)
-- ---------------------------------------------------------------------------
CREATE POLICY lb_all ON leaderboard FOR SELECT USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- session_player_stats: coach sees all; players see their own
-- ---------------------------------------------------------------------------
CREATE POLICY sps_coach  ON session_player_stats FOR SELECT USING (is_coach());
CREATE POLICY sps_player ON session_player_stats FOR SELECT USING (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- playlists: coach sees all; public playlists visible to authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY pl_coach  ON playlists FOR SELECT USING (is_coach());
CREATE POLICY pl_public ON playlists FOR SELECT USING (is_public AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- playlist_hands: mirrors playlist visibility
-- ---------------------------------------------------------------------------
CREATE POLICY plh_coach  ON playlist_hands FOR SELECT USING (is_coach());
CREATE POLICY plh_public ON playlist_hands FOR SELECT USING (
  playlist_id IN (SELECT playlist_id FROM playlists WHERE is_public = true)
  AND auth.role() = 'authenticated'
);

-- ---------------------------------------------------------------------------
-- Server-side writes (service role bypasses RLS — no INSERT policies needed)
-- All writes go through Node.js server with service_role key.
-- ---------------------------------------------------------------------------
