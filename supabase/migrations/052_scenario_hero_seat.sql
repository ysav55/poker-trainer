-- Migration 052: Add hero_seat to scenarios
-- Marks which seat in the scenario is the "hero" — the seat a real player
-- occupies when the scenario is launched at a table. Other seats may be
-- bots or other players; hero seat receives the seat's configured cards
-- (or RNG if cards are empty). Nullable — legacy scenarios have no hero.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS hero_seat SMALLINT
  CHECK (hero_seat IS NULL OR (hero_seat >= 0 AND hero_seat <= 9));
