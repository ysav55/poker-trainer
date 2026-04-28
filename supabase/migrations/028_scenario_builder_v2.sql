-- supabase/migrations/028_scenario_builder_v2.sql
-- Scenario Builder v2: new schema for scenarios, folders, playlist_items, drill_sessions.
-- Old tables (scenario_configs, playlist_hands) are left intact — used by legacy socket handlers.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SCENARIO_FOLDERS
--    Coach-level folder hierarchy for organizing scenarios and playlists.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE scenario_folders (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  parent_id   UUID         REFERENCES scenario_folders(id) ON DELETE SET NULL,
  name        VARCHAR(100) NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folders_coach ON scenario_folders(coach_id, parent_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SCENARIOS
--    One row per scenario configuration (versioned).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE scenarios (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  folder_id       UUID         REFERENCES scenario_folders(id) ON DELETE SET NULL,
  version         INTEGER      NOT NULL DEFAULT 1,
  parent_id       UUID         REFERENCES scenarios(id) ON DELETE SET NULL,
  is_current      BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Identity
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  tags            TEXT[]       NOT NULL DEFAULT '{}',

  -- Table state
  player_count    INTEGER      NOT NULL CHECK (player_count BETWEEN 2 AND 9),
  btn_seat        INTEGER      NOT NULL CHECK (btn_seat >= 0),
  card_mode       VARCHAR(10)  NOT NULL CHECK (card_mode IN ('fixed', 'range')),

  -- Cards per seat (JSONB array, length = player_count)
  -- Fixed: [{"seat":0,"cards":["Ah","Kd"]}, ...]
  -- Range: [{"seat":0,"range":"AA,KK,QQ"}, ...]
  -- Mixed: some seats fixed, some range
  seat_configs    JSONB        NOT NULL DEFAULT '[]',

  -- Stacks relative to BB: [{"seat":0,"stack_bb":100}, ...]
  stack_configs   JSONB        NOT NULL DEFAULT '[]',

  -- Board
  board_mode      VARCHAR(20)  NOT NULL DEFAULT 'none'
                               CHECK (board_mode IN ('none', 'specific', 'texture')),
  board_flop      VARCHAR(6),   -- e.g. "3s5hTd" (3 cards × 2 chars)
  board_turn      VARCHAR(2),
  board_river     VARCHAR(2),
  board_texture   VARCHAR(20)  CHECK (board_texture IN
                    ('monotone','two_tone','rainbow','paired','connected','dry','wet')),
  texture_turn    VARCHAR(2),
  texture_river   VARCHAR(2),

  -- Blind mode: true = student doesn't see "Drill hand" indicator
  blind_mode      BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Metadata
  source_hand_id  UUID         REFERENCES hands(hand_id) ON DELETE SET NULL,
  is_shareable    BOOLEAN      NOT NULL DEFAULT FALSE,
  play_count      INTEGER      NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenarios_coach   ON scenarios(coach_id, is_current) WHERE deleted_at IS NULL;
CREATE INDEX idx_scenarios_folder  ON scenarios(folder_id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_scenarios_tags    ON scenarios USING GIN(tags);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PLAYLIST EXTENSIONS
--    Extend existing playlists table with new columns.
--    All columns default-safe so existing rows and old code are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS folder_id    UUID        REFERENCES scenario_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags         TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ordering     VARCHAR(10) NOT NULL DEFAULT 'sequential'
                                          CHECK (ordering IN ('sequential','random','manual')),
  ADD COLUMN IF NOT EXISTS advance_mode VARCHAR(10) NOT NULL DEFAULT 'manual'
                                          CHECK (advance_mode IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS is_shareable BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PLAYLIST_ITEMS
--    Junction table for new builder (scenarios ↔ playlists).
--    Separate from legacy playlist_hands — both can coexist.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE playlist_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID    NOT NULL REFERENCES playlists(playlist_id) ON DELETE CASCADE,
  scenario_id UUID    NOT NULL REFERENCES scenarios(id)          ON DELETE CASCADE,
  position    INTEGER NOT NULL,

  UNIQUE (playlist_id, position)
);

CREATE INDEX idx_playlist_items_playlist ON playlist_items(playlist_id, position);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DRILL_SESSIONS
--    Tracks an active playlist execution at a table.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE drill_sessions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         TEXT         NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  playlist_id      UUID         NOT NULL REFERENCES playlists(playlist_id),
  coach_id         UUID         NOT NULL REFERENCES player_profiles(id),
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','paused','completed','cancelled')),

  current_position INTEGER      NOT NULL DEFAULT 0,
  items_dealt      INTEGER      NOT NULL DEFAULT 0,
  items_total      INTEGER      NOT NULL,

  opted_in_players  UUID[]      NOT NULL DEFAULT '{}',
  opted_out_players UUID[]      NOT NULL DEFAULT '{}',

  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at         TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_drill_sessions_table ON drill_sessions(table_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HANDS TABLE EXTENSIONS
--    Link dealt hands back to the scenario and drill session that produced them.
--    is_scenario_hand already exists; we add the FKs.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS scenario_id      UUID REFERENCES scenarios(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drill_session_id UUID REFERENCES drill_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_hands_scenario ON hands(scenario_id)      WHERE scenario_id      IS NOT NULL;
CREATE INDEX idx_hands_drill    ON hands(drill_session_id) WHERE drill_session_id IS NOT NULL;

COMMIT;
