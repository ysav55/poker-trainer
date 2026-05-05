-- supabase/migrations/025_staking.sql
-- Real-money staking tracker: contracts, sessions, settlements, adjustments.
-- The app never touches money — it's the accounting engine that tracks P&L,
-- makeup, and profit splits between coaches and their staked players.

BEGIN;

-- ─── staking_contracts ───────────────────────────────────────────────────────
-- One active contract per player at a time (enforced at app layer).

CREATE TABLE IF NOT EXISTS staking_contracts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  player_id        UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'paused', 'completed', 'terminated')),

  -- Split terms (coach_split + player_split = 100)
  coach_split_pct  INTEGER      NOT NULL CHECK (coach_split_pct BETWEEN 1 AND 99),
  player_split_pct INTEGER      NOT NULL CHECK (player_split_pct BETWEEN 1 AND 99),

  -- Makeup policy
  makeup_policy    VARCHAR(20)  NOT NULL DEFAULT 'carries'
                   CHECK (makeup_policy IN ('carries', 'resets_monthly', 'resets_on_settle')),

  -- Bankroll
  bankroll_cap     DECIMAL(12,2),          -- null = unlimited
  total_invested   DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Contract duration
  start_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  end_date         DATE,                   -- null = open-ended
  auto_renew       BOOLEAN      NOT NULL DEFAULT false,

  notes            TEXT,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by       UUID         REFERENCES player_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staking_contracts_coach   ON staking_contracts(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_staking_contracts_player  ON staking_contracts(player_id, status);

-- ─── staking_sessions ────────────────────────────────────────────────────────
-- Individual real-money poker sessions logged by coach or player.

CREATE TABLE IF NOT EXISTS staking_sessions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID         NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,
  player_id         UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,

  session_date      DATE         NOT NULL,
  platform          VARCHAR(50)  NOT NULL,
  game_type         VARCHAR(50)  NOT NULL,
  game_format       VARCHAR(20)  NOT NULL DEFAULT 'cash'
                    CHECK (game_format IN ('cash', 'tournament', 'sit_and_go')),

  buy_in            DECIMAL(12,2) NOT NULL CHECK (buy_in >= 0),
  cashout           DECIMAL(12,2) NOT NULL CHECK (cashout >= 0),
  -- net is computed at app layer (cashout - buy_in)

  reported_by       UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  reported_by_role  VARCHAR(10)  NOT NULL CHECK (reported_by_role IN ('coach', 'player')),
  notes             TEXT,
  duration_hours    DECIMAL(4,1),

  status            VARCHAR(20)  NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending', 'confirmed', 'disputed', 'deleted')),
  confirmed_by      UUID         REFERENCES player_profiles(id) ON DELETE SET NULL,
  confirmed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_sessions_contract ON staking_sessions(contract_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_staking_sessions_player   ON staking_sessions(player_id, session_date DESC);

-- ─── staking_settlements ─────────────────────────────────────────────────────
-- Settlement records. Zeros the ledger when both parties approve.

CREATE TABLE IF NOT EXISTS staking_settlements (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id          UUID         NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,

  period_start         DATE         NOT NULL,
  period_end           DATE         NOT NULL,
  sessions_count       INTEGER      NOT NULL,
  total_buy_ins        DECIMAL(12,2) NOT NULL,
  total_cashouts       DECIMAL(12,2) NOT NULL,
  gross_pnl            DECIMAL(12,2) NOT NULL,
  makeup_before        DECIMAL(12,2) NOT NULL,
  makeup_after         DECIMAL(12,2) NOT NULL,

  profit_above_makeup  DECIMAL(12,2) NOT NULL,
  coach_share          DECIMAL(12,2) NOT NULL,
  player_share         DECIMAL(12,2) NOT NULL,

  proposed_by          UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  proposed_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  coach_approved       BOOLEAN      NOT NULL DEFAULT false,
  coach_approved_at    TIMESTAMPTZ,
  player_approved      BOOLEAN      NOT NULL DEFAULT false,
  player_approved_at   TIMESTAMPTZ,

  status               VARCHAR(20)  NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed', 'approved', 'rejected', 'voided')),
  settled_at           TIMESTAMPTZ,

  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_settlements_contract ON staking_settlements(contract_id, settled_at DESC);

-- ─── staking_adjustments ─────────────────────────────────────────────────────
-- Manual corrections: forgive makeup, adjust balance, bonus/penalty.

CREATE TABLE IF NOT EXISTS staking_adjustments (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID         NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,

  type         VARCHAR(20)  NOT NULL
               CHECK (type IN ('forgive_makeup', 'adjust_makeup', 'correction', 'bonus', 'penalty')),
  amount       DECIMAL(12,2) NOT NULL,   -- positive = player's favor, negative = against
  reason       TEXT         NOT NULL,

  created_by   UUID         NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_adjustments_contract ON staking_adjustments(contract_id, created_at DESC);

-- ─── New permissions ──────────────────────────────────────────────────────────

INSERT INTO permissions (key) VALUES
  ('staking:manage'),
  ('staking:view'),
  ('staking:report')
ON CONFLICT (key) DO NOTHING;

-- Grant staking:manage to coach role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'coach' AND p.key = 'staking:manage'
ON CONFLICT DO NOTHING;

-- Grant staking:manage to admin/superadmin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'superadmin') AND p.key IN ('staking:manage', 'staking:view', 'staking:report')
ON CONFLICT DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE staking_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staking_contracts_all"   ON staking_contracts   FOR ALL USING (true);
CREATE POLICY "staking_sessions_all"    ON staking_sessions    FOR ALL USING (true);
CREATE POLICY "staking_settlements_all" ON staking_settlements FOR ALL USING (true);
CREATE POLICY "staking_adjustments_all" ON staking_adjustments FOR ALL USING (true);

COMMIT;
