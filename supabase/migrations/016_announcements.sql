-- Migration 016: Announcements system
-- Coach-to-student in-app messaging with read receipts.

-- ── Target audience enum ──────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE announcement_target AS ENUM ('all', 'group', 'individual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Announcements ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id   UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE SET NULL,
  target_type announcement_target NOT NULL DEFAULT 'all',
  -- target_id: NULL = all students, else group tag name or individual player_id
  target_id   TEXT,
  title       TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_author_idx      ON announcements (author_id);
CREATE INDEX IF NOT EXISTS announcements_target_type_idx ON announcements (target_type);
CREATE INDEX IF NOT EXISTS announcements_created_at_idx  ON announcements (created_at DESC);

-- ── Read receipts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  player_id       UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, player_id)
);

CREATE INDEX IF NOT EXISTS announcement_reads_player_idx ON announcement_reads (player_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; all application access goes through Express
-- with the Supabase service-role key, so we only need to lock out anon/jwt clients.

CREATE POLICY "service_role_announcements_all"
  ON announcements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_announcement_reads_all"
  ON announcement_reads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
