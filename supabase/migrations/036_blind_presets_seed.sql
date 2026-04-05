-- Migration 036: Seed system blind structure presets (re-runnable).
BEGIN;

INSERT INTO blind_structure_presets (name, description, levels, is_system)
VALUES
  (
    'Turbo 6-max',
    'Fast blinds, doubles every 2 levels, 10 min each',
    '[
      {"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":10},
      {"level":2,"sb":50,"bb":100,"ante":0,"duration_minutes":10},
      {"level":3,"sb":100,"bb":200,"ante":25,"duration_minutes":10},
      {"level":4,"sb":200,"bb":400,"ante":50,"duration_minutes":10},
      {"level":5,"sb":400,"bb":800,"ante":100,"duration_minutes":10},
      {"level":6,"sb":600,"bb":1200,"ante":200,"duration_minutes":10},
      {"level":7,"sb":1000,"bb":2000,"ante":300,"duration_minutes":10},
      {"level":8,"sb":1500,"bb":3000,"ante":500,"duration_minutes":10}
    ]'::jsonb,
    true
  ),
  (
    'Standard MTT',
    'Typical live club structure, 20 min levels',
    '[
      {"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":20},
      {"level":2,"sb":50,"bb":100,"ante":0,"duration_minutes":20},
      {"level":3,"sb":75,"bb":150,"ante":25,"duration_minutes":20},
      {"level":4,"sb":100,"bb":200,"ante":25,"duration_minutes":20},
      {"level":5,"sb":150,"bb":300,"ante":50,"duration_minutes":20},
      {"level":6,"sb":200,"bb":400,"ante":50,"duration_minutes":20},
      {"level":7,"sb":300,"bb":600,"ante":75,"duration_minutes":20},
      {"level":8,"sb":400,"bb":800,"ante":100,"duration_minutes":20},
      {"level":9,"sb":600,"bb":1200,"ante":200,"duration_minutes":20},
      {"level":10,"sb":800,"bb":1600,"ante":200,"duration_minutes":20},
      {"level":11,"sb":1000,"bb":2000,"ante":300,"duration_minutes":20},
      {"level":12,"sb":1500,"bb":3000,"ante":400,"duration_minutes":20},
      {"level":13,"sb":2000,"bb":4000,"ante":500,"duration_minutes":20},
      {"level":14,"sb":3000,"bb":6000,"ante":1000,"duration_minutes":20},
      {"level":15,"sb":4000,"bb":8000,"ante":1000,"duration_minutes":20}
    ]'::jsonb,
    true
  ),
  (
    'Deep Stack',
    'Slow, skill-heavy structure, 30 min levels',
    '[
      {"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":30},
      {"level":2,"sb":50,"bb":100,"ante":0,"duration_minutes":30},
      {"level":3,"sb":75,"bb":150,"ante":0,"duration_minutes":30},
      {"level":4,"sb":100,"bb":200,"ante":25,"duration_minutes":30},
      {"level":5,"sb":150,"bb":300,"ante":25,"duration_minutes":30},
      {"level":6,"sb":200,"bb":400,"ante":50,"duration_minutes":30},
      {"level":7,"sb":300,"bb":600,"ante":75,"duration_minutes":30},
      {"level":8,"sb":500,"bb":1000,"ante":100,"duration_minutes":30},
      {"level":9,"sb":750,"bb":1500,"ante":200,"duration_minutes":30},
      {"level":10,"sb":1000,"bb":2000,"ante":300,"duration_minutes":30},
      {"level":11,"sb":1500,"bb":3000,"ante":400,"duration_minutes":30},
      {"level":12,"sb":2000,"bb":4000,"ante":500,"duration_minutes":30}
    ]'::jsonb,
    true
  ),
  (
    'Hyper Turbo',
    'For quick coaching sessions, 6 min levels',
    '[
      {"level":1,"sb":50,"bb":100,"ante":0,"duration_minutes":6},
      {"level":2,"sb":100,"bb":200,"ante":25,"duration_minutes":6},
      {"level":3,"sb":200,"bb":400,"ante":50,"duration_minutes":6},
      {"level":4,"sb":400,"bb":800,"ante":100,"duration_minutes":6},
      {"level":5,"sb":800,"bb":1600,"ante":200,"duration_minutes":6},
      {"level":6,"sb":1200,"bb":2400,"ante":400,"duration_minutes":6}
    ]'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;

COMMIT;
