-- Migration 015: Persistent chip bank per player
-- Adds player_chip_bank (balance) and chip_transactions (audit log).

-- 1. Per-player chip balance
CREATE TABLE IF NOT EXISTS player_chip_bank (
  player_id   UUID        NOT NULL PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  balance     INTEGER     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Immutable transaction log
CREATE TYPE chip_transaction_type AS ENUM (
  'reload',             -- coach/admin tops up a player bank
  'buy_in',             -- player joins a table
  'cash_out',           -- player leaves a table (remaining stack returned)
  'adjustment',         -- manual admin correction
  'staking_deposit',    -- reserved: backer funds a player's bank
  'staking_withdrawal'  -- reserved: player repays backer
);

CREATE TABLE IF NOT EXISTS chip_transactions (
  id          BIGSERIAL   PRIMARY KEY,
  player_id   UUID        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  amount      INTEGER     NOT NULL,   -- positive = credit, negative = debit
  type        chip_transaction_type NOT NULL,
  table_id    TEXT        REFERENCES tables(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES player_profiles(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_chip_transactions_player    ON chip_transactions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chip_transactions_table     ON chip_transactions(table_id) WHERE table_id IS NOT NULL;

-- 4. Helper function: atomic credit/debit + balance update
-- Returns the new balance. Raises an exception if the result would go below 0.
CREATE OR REPLACE FUNCTION apply_chip_transaction(
  p_player_id  UUID,
  p_amount     INTEGER,
  p_type       chip_transaction_type,
  p_table_id   TEXT    DEFAULT NULL,
  p_created_by UUID    DEFAULT NULL,
  p_notes      TEXT    DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  -- Upsert the bank row, applying the delta atomically
  INSERT INTO player_chip_bank (player_id, balance, updated_at)
  VALUES (p_player_id, GREATEST(0, p_amount), NOW())
  ON CONFLICT (player_id)
  DO UPDATE SET
    balance    = player_chip_bank.balance + p_amount,
    updated_at = NOW()
  WHERE (player_chip_bank.balance + p_amount) >= 0
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_funds: balance would go below zero';
  END IF;

  -- Append transaction log entry
  INSERT INTO chip_transactions (player_id, amount, type, table_id, created_by, notes)
  VALUES (p_player_id, p_amount, p_type, p_table_id, p_created_by, p_notes);

  RETURN new_balance;
END;
$$;

-- 5. RLS: all authenticated users can read their own bank/transactions;
--    service role (server) bypasses RLS entirely.
ALTER TABLE player_chip_bank    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chip_transactions   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_chip_bank_read_own"
  ON player_chip_bank FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "chip_transactions_read_own"
  ON chip_transactions FOR SELECT
  USING (player_id = auth.uid());
