-- =============================================================================
-- Migration 004: Phase 6 — New Data Collection Fields
-- Adds position, stack_at_action, pot_at_action, decision_time_ms, session_type
-- =============================================================================

-- ── hand_players: add position column ───────────────────────────────────────
-- No CHECK constraint — position labels are BTN/SB/BB/UTG/UTG+1/HJ/CO for
-- 2–7 players; larger tables get EP{n} labels from _computePositions().
ALTER TABLE hand_players
  ADD COLUMN IF NOT EXISTS position text DEFAULT NULL;

-- ── hand_actions: add context columns ────────────────────────────────────────
ALTER TABLE hand_actions
  ADD COLUMN IF NOT EXISTS stack_at_action   int      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pot_at_action     int      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS decision_time_ms  int      DEFAULT NULL;

-- ── hands: add session_type column ───────────────────────────────────────────
-- Values: 'rng' | 'manual' | 'drill' (configured hand) | 'replay'
ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS session_type text DEFAULT NULL;
