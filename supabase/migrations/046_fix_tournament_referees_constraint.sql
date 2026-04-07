-- Migration 046: Fix tournament_referees uniqueness constraint
--
-- Problem: The UNIQUE NULLS NOT DISTINCT (table_id, group_id, active) constraint
-- on tournament_referees prevents recording history — multiple revoked (active=false)
-- entries for the same table/group are blocked, so you can't re-appoint a referee
-- after revoking a prior appointment.
--
-- Fix: Replace with a partial unique index that only enforces uniqueness when
-- active=true. This allows unlimited revoked history while still preventing
-- two simultaneous active appointments for the same tournament scope.
--
-- Note: NULLS NOT DISTINCT is required on the index because the ref_scope_xor
-- constraint guarantees exactly one of (table_id, group_id) is always NULL,
-- so standard NULL-distinct uniqueness would never fire.

BEGIN;

ALTER TABLE tournament_referees
  DROP CONSTRAINT IF EXISTS tournament_referees_table_id_group_id_active_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_referees_one_active
  ON tournament_referees (table_id, group_id)
  NULLS NOT DISTINCT
  WHERE active = true;

COMMIT;
