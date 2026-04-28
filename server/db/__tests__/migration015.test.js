'use strict';

/**
 * Migration 015 — Structural validation tests.
 *
 * Reads the SQL file and asserts all required DDL statements are present.
 * No live database connection required.
 *
 * Coverage:
 *  - table_privacy enum is created with correct values
 *  - privacy and controller_id columns added to tables
 *  - invited_players table with correct structure
 *  - table_presets table with correct structure
 *  - Migration is wrapped in BEGIN / COMMIT
 */

const fs   = require('fs');
const path = require('path');

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../supabase/migrations/015_table_privacy_controller_presets.sql'
);

let sql;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
});

describe('transaction wrapping', () => {
  test('starts with BEGIN', () => {
    expect(sql).toMatch(/^\s*BEGIN\s*;/m);
  });

  test('ends with COMMIT', () => {
    expect(sql).toMatch(/COMMIT\s*;/m);
  });
});

describe('table_privacy enum', () => {
  test('enum is created', () => {
    expect(sql).toMatch(/CREATE TYPE table_privacy AS ENUM/im);
  });

  test('contains open, school, private', () => {
    const block = sql.match(/CREATE TYPE table_privacy AS ENUM\s*\([^)]+\)/ims)?.[0] ?? '';
    expect(block).toMatch(/'open'/);
    expect(block).toMatch(/'school'/);
    expect(block).toMatch(/'private'/);
  });
});

describe('tables columns', () => {
  test('privacy column added with default open', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS privacy\s+table_privacy\s+NOT NULL\s+DEFAULT 'open'/im);
  });

  test('controller_id column added as nullable FK', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS controller_id\s+UUID\s+REFERENCES player_profiles/im);
  });

  test('index created on privacy', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_tables_privacy/im);
  });
});

describe('invited_players table', () => {
  test('CREATE TABLE invited_players exists', () => {
    expect(sql).toMatch(/CREATE TABLE invited_players\s*\(/im);
  });

  test('has table_id column referencing tables', () => {
    expect(sql).toMatch(/table_id\s+TEXT\s+REFERENCES tables\(id\)/im);
  });

  test('has player_id column referencing player_profiles', () => {
    expect(sql).toMatch(/player_id\s+UUID\s+REFERENCES player_profiles\(id\)/im);
  });

  test('uses composite primary key', () => {
    expect(sql).toMatch(/PRIMARY KEY\s*\(\s*table_id\s*,\s*player_id\s*\)/im);
  });

  test('cascades on table delete', () => {
    expect(sql).toMatch(/invited_players[\s\S]*?ON DELETE CASCADE/im);
  });

  test('indexes are created on table_id and player_id', () => {
    expect(sql).toMatch(/CREATE INDEX idx_invited_players_table/im);
    expect(sql).toMatch(/CREATE INDEX idx_invited_players_player/im);
  });
});

describe('table_presets table', () => {
  test('CREATE TABLE table_presets exists', () => {
    expect(sql).toMatch(/CREATE TABLE table_presets\s*\(/im);
  });

  test('has UUID primary key', () => {
    // The id col comes first in table_presets
    const block = sql.match(/CREATE TABLE table_presets\s*\([\s\S]*?\);/im)?.[0] ?? '';
    expect(block).toMatch(/id\s+UUID\s+PRIMARY KEY/im);
  });

  test('has coach_id FK to player_profiles', () => {
    expect(sql).toMatch(/coach_id\s+UUID\s+NOT NULL\s+REFERENCES player_profiles\(id\)/im);
  });

  test('has name column', () => {
    const block = sql.match(/CREATE TABLE table_presets\s*\([\s\S]*?\);/im)?.[0] ?? '';
    expect(block).toMatch(/name\s+TEXT\s+NOT NULL/im);
  });

  test('has JSONB config column', () => {
    const block = sql.match(/CREATE TABLE table_presets\s*\([\s\S]*?\);/im)?.[0] ?? '';
    expect(block).toMatch(/config\s+JSONB/im);
  });

  test('cascades on coach delete', () => {
    expect(sql).toMatch(/table_presets[\s\S]*?ON DELETE CASCADE/im);
  });

  test('has index on coach_id', () => {
    expect(sql).toMatch(/CREATE INDEX idx_table_presets_coach/im);
  });
});
