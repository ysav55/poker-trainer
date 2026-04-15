-- Add school_id to tables
ALTER TABLE tables ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tables_school_id ON tables(school_id);

-- Add school_id to tournament_groups
ALTER TABLE tournament_groups ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX idx_tournament_groups_school_id ON tournament_groups(school_id);

-- Create private_table_whitelist
CREATE TABLE private_table_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id VARCHAR(100) NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(table_id, player_id)
);

CREATE INDEX idx_whitelist_table_id ON private_table_whitelist(table_id);
CREATE INDEX idx_whitelist_player_id ON private_table_whitelist(player_id);
