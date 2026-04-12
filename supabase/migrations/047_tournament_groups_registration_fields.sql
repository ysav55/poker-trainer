-- supabase/migrations/047_tournament_groups_registration_fields.sql
-- Extend tournament_groups with registration/scheduling/prize fields.
-- Add tournament transaction types to chip_transaction_type enum.

-- Add tournament transaction types to existing enum
-- (Must run outside a transaction block for Postgres enum extension)
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_entry';
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_refund';
ALTER TYPE chip_transaction_type ADD VALUE IF NOT EXISTS 'tournament_prize';

BEGIN;

-- Extend tournament_groups
ALTER TABLE tournament_groups
  ADD COLUMN IF NOT EXISTS buy_in           INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS privacy          TEXT         NOT NULL DEFAULT 'public'
                                            CHECK (privacy IN ('public', 'school', 'private')),
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_structure JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS late_reg_enabled BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reg_minutes INTEGER      NOT NULL DEFAULT 20;

COMMIT;
