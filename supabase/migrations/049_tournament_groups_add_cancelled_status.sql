-- Migration 049: Add 'cancelled' to tournament_groups.status CHECK constraint.
-- Previously the constraint only allowed: pending, running, balancing, finished.
-- The cancel endpoint needs to set status = 'cancelled' (distinct from 'finished').

BEGIN;

ALTER TABLE tournament_groups
  DROP CONSTRAINT IF EXISTS tournament_groups_status_check;

ALTER TABLE tournament_groups
  ADD CONSTRAINT tournament_groups_status_check
    CHECK (status IN ('pending', 'running', 'balancing', 'finished', 'cancelled'));

COMMIT;
