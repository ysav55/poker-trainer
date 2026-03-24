-- Migration 006: Hand Analyzer v2
-- Adds position context to hand_actions and player/action targeting to hand_tags.
-- Part of the hand analyzer v2 refactor (plans/hand-analyzer-v2.md).
-- Old rows get NULL in new columns — all analyzers skip gracefully when absent.

BEGIN;

-- Per-action position context (BTN, SB, BB, UTG, HJ, CO, etc.)
-- Written at recordAction time in server/index.js via positions.js utility.
ALTER TABLE hand_actions ADD COLUMN IF NOT EXISTS position VARCHAR(8);

-- Per-player and per-action tag targeting.
-- Hand-level tags leave both NULL.
-- Player-level mistake/sizing tags set player_id.
-- Action-level sizing tags also set action_id.
ALTER TABLE hand_tags ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES player_profiles(id) ON DELETE SET NULL;
ALTER TABLE hand_tags ADD COLUMN IF NOT EXISTS action_id BIGINT REFERENCES hand_actions(id) ON DELETE SET NULL;

-- Add 'sizing' to the allowed tag_type values.
-- tag_type is text with a CHECK constraint (not an enum), so we must drop and recreate it.
ALTER TABLE hand_tags DROP CONSTRAINT IF EXISTS hand_tags_tag_type_check;
ALTER TABLE hand_tags ADD CONSTRAINT hand_tags_tag_type_check
  CHECK (tag_type IN ('auto', 'mistake', 'coach', 'sizing'));

-- The old unique constraint (hand_id, tag, tag_type) breaks for per-player tags:
-- the same tag can fire for multiple players on the same hand.
-- Replace with a partial unique index covering only hand-level tags (player_id IS NULL),
-- and a separate one for player-level tags.
ALTER TABLE hand_tags DROP CONSTRAINT IF EXISTS hand_tags_hand_id_tag_tag_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS hand_tags_unique_hand_level
  ON hand_tags (hand_id, tag, tag_type)
  WHERE player_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hand_tags_unique_player_level
  ON hand_tags (hand_id, tag, tag_type, player_id)
  WHERE player_id IS NOT NULL AND action_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hand_tags_unique_action_level
  ON hand_tags (hand_id, tag, tag_type, player_id, action_id)
  WHERE player_id IS NOT NULL AND action_id IS NOT NULL;

-- Indexes for the new columns to support common queries:
-- "show all hands where Alice played BTN"
-- "show all HERO_CALL tags for player X"
CREATE INDEX IF NOT EXISTS idx_hand_actions_position ON hand_actions (position);
CREATE INDEX IF NOT EXISTS idx_hand_tags_player      ON hand_tags (player_id);
CREATE INDEX IF NOT EXISTS idx_hand_tags_action      ON hand_tags (action_id);

COMMIT;
