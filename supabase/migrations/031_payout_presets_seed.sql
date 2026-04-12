-- Migration 031: Seed system payout presets (re-runnable via ON CONFLICT DO NOTHING).
BEGIN;

INSERT INTO payout_presets (name, tiers, is_system)
VALUES
  (
    'Winner Takes All',
    '[
      {"min_entrants":2,"max_entrants":500,"payouts":[{"position":1,"percentage":100}]}
    ]'::jsonb,
    true
  ),
  (
    'Top 2',
    '[
      {"min_entrants":2,"max_entrants":500,"payouts":[{"position":1,"percentage":65},{"position":2,"percentage":35}]}
    ]'::jsonb,
    true
  ),
  (
    'Top 3',
    '[
      {"min_entrants":2,"max_entrants":9,"payouts":[{"position":1,"percentage":100}]},
      {"min_entrants":10,"max_entrants":500,"payouts":[{"position":1,"percentage":50},{"position":2,"percentage":30},{"position":3,"percentage":20}]}
    ]'::jsonb,
    true
  ),
  (
    'Flat Top 3',
    '[
      {"min_entrants":2,"max_entrants":9,"payouts":[{"position":1,"percentage":100}]},
      {"min_entrants":10,"max_entrants":17,"payouts":[{"position":1,"percentage":50},{"position":2,"percentage":30},{"position":3,"percentage":20}]},
      {"min_entrants":18,"max_entrants":27,"payouts":[{"position":1,"percentage":45},{"position":2,"percentage":30},{"position":3,"percentage":15},{"position":4,"percentage":10}]},
      {"min_entrants":28,"max_entrants":500,"payouts":[{"position":1,"percentage":40},{"position":2,"percentage":25},{"position":3,"percentage":15},{"position":4,"percentage":12},{"position":5,"percentage":8}]}
    ]'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;

COMMIT;
