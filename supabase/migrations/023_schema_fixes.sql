-- Migration 023: Schema fixes — position CHECK, missing RLS, leaderboard_view,
-- stack_adjustments anon policy, hands.table_id FK.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Fix hand_players.position CHECK constraint
--
-- Migration 001 constrained position to 7 names. The server (positions.js)
-- generates 9 distinct names for 7-9 player tables: BTN, SB, BB, UTG,
-- UTG+1, UTG+2, CO, HJ, MP. Inserting 'MP' or 'UTG+2' at a 7-9 player
-- table violates the old constraint and silently drops the hand_players row.
-- ---------------------------------------------------------------------------
ALTER TABLE hand_players
  DROP CONSTRAINT IF EXISTS hand_players_position_check;

ALTER TABLE hand_players
  ADD CONSTRAINT hand_players_position_check
    CHECK (position IN ('BTN','SB','BB','UTG','UTG+1','UTG+2','CO','HJ','MP'));

-- ---------------------------------------------------------------------------
-- 2. Recreate leaderboard_view
--
-- Dropped in migration 005 and never recreated.
-- Now includes three_bet_pct (added to leaderboard in 005).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  l.player_id,
  l.display_name,
  l.total_hands,
  l.total_wins,
  l.net_chips,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.vpip_count::numeric        / l.total_hands * 100, 1) ELSE 0 END AS vpip_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.pfr_count::numeric         / l.total_hands * 100, 1) ELSE 0 END AS pfr_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.three_bet_count::numeric   / l.total_hands * 100, 1) ELSE 0 END AS three_bet_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.wtsd_count::numeric        / l.total_hands * 100, 1) ELSE 0 END AS wtsd_pct,
  CASE WHEN l.wtsd_count   > 0 THEN ROUND(l.wsd_count::numeric         / l.wtsd_count  * 100, 1) ELSE 0 END AS wsd_pct,
  CASE WHEN l.total_hands  > 0 THEN ROUND(l.total_wins::numeric        / l.total_hands * 100, 1) ELSE 0 END AS win_pct,
  l.last_hand_at,
  l.updated_at
FROM leaderboard l;

-- ---------------------------------------------------------------------------
-- 3. Fix stack_adjustments anon-read policy
--
-- Migration 005 opened this table to anonymous reads. All other sensitive
-- tables use service_role-only or auth-required policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS stack_adj_anon_read ON stack_adjustments;

CREATE POLICY "service_role_stack_adjustments_all"
  ON stack_adjustments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Enable RLS + service_role policies on tables missing them
--
-- Migrations 012, 013, and 015 (table_privacy) created tables without RLS.
-- The server uses the service_role key (which bypasses RLS), so enabling
-- RLS here locks out direct anon/jwt access without breaking server writes.
-- ---------------------------------------------------------------------------

-- migration 012: CRM tables
ALTER TABLE player_notes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tags                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_performance_snapshots  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_player_notes_all"
  ON player_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_player_tags_all"
  ON player_tags FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_coaching_sessions_all"
  ON coaching_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_player_performance_snapshots_all"
  ON player_performance_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migration 013: tournament tables
ALTER TABLE tournament_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_standings  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_tournament_configs_all"
  ON tournament_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_tournament_standings_all"
  ON tournament_standings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migration 015 (table_privacy): invited_players, table_presets
ALTER TABLE invited_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_presets    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_invited_players_all"
  ON invited_players FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_table_presets_all"
  ON table_presets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. Add FK from hands.table_id to tables(id)
--
-- Migration 010 added fk_sessions_table but left hands.table_id as bare text.
-- Using NOT VALID to skip scanning existing rows (same pattern as migration 010).
-- ---------------------------------------------------------------------------
ALTER TABLE hands
  ADD CONSTRAINT fk_hands_table
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
  NOT VALID;

COMMIT;
