-- Create school_passwords table
CREATE TABLE school_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  source VARCHAR(100),
  max_uses INT NOT NULL DEFAULT 999999,
  uses_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES player_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT must_have_expiry_or_max_uses
    CHECK (expires_at IS NOT NULL OR max_uses IS NOT NULL)
);

CREATE INDEX idx_school_passwords_school_id ON school_passwords(school_id);
CREATE INDEX idx_school_passwords_active ON school_passwords(active);

-- Create school_password_uses table (audit + dedup)
CREATE TABLE school_password_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_id UUID NOT NULL REFERENCES school_passwords(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id),
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(password_id, player_id)
);

CREATE INDEX idx_password_uses_password_id ON school_password_uses(password_id);
