-- Add school_id and privacy columns to tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS privacy TEXT NOT NULL DEFAULT 'open' CHECK (privacy IN ('open', 'school', 'private'));

CREATE INDEX IF NOT EXISTS idx_tournaments_school_id ON tournaments(school_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_privacy ON tournaments(privacy);

-- Create tournament_whitelist table (similar to private_table_whitelist)
CREATE TABLE IF NOT EXISTS tournament_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_whitelist_tournament_id ON tournament_whitelist(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_whitelist_player_id ON tournament_whitelist(player_id);
