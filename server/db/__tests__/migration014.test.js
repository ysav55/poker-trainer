'use strict';

/**
 * Migration 014 — Structural validation tests.
 *
 * These tests read the SQL file and assert that all required DDL statements
 * are present and well-formed. No live database connection is required.
 *
 * Coverage:
 *  - schools table is created with expected columns
 *  - Default school seed row exists (stable UUID)
 *  - school_id FK is added to all four target tables
 *  - Audit columns (updated_by / created_by) are added to correct tables
 *  - settings table and enum are created
 *  - Scenario marketplace columns are added to scenario_configs
 *  - referral_code column and index are added to player_profiles
 *  - Migration is wrapped in a transaction (BEGIN / COMMIT)
 *  - All FK additions use IF NOT EXISTS (non-breaking)
 */

const fs   = require('fs');
const path = require('path');

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../supabase/migrations/014_schema_future_prep.sql'
);

let sql;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
});

// ── Transaction ────────────────────────────────────────────────────────────────

describe('transaction wrapping', () => {
  test('starts with BEGIN', () => {
    expect(sql).toMatch(/^\s*BEGIN\s*;/m);
  });

  test('ends with COMMIT', () => {
    expect(sql).toMatch(/COMMIT\s*;/m);
  });
});

// ── schools table ──────────────────────────────────────────────────────────────

describe('schools table', () => {
  test('CREATE TABLE schools exists', () => {
    expect(sql).toMatch(/CREATE TABLE schools\s*\(/im);
  });

  test('has UUID primary key', () => {
    expect(sql).toMatch(/id\s+UUID\s+PRIMARY KEY/im);
  });

  test('has name column', () => {
    expect(sql).toMatch(/name\s+TEXT\s+NOT NULL/im);
  });

  test('has logo_url column', () => {
    expect(sql).toMatch(/logo_url\s+TEXT/im);
  });

  test('has primary_color column', () => {
    expect(sql).toMatch(/primary_color\s+VARCHAR\(7\)/im);
  });

  test('has theme JSONB column', () => {
    expect(sql).toMatch(/theme\s+JSONB/im);
  });
});

// ── Default school seed ────────────────────────────────────────────────────────

describe('default school seed', () => {
  test('inserts a row into schools', () => {
    expect(sql).toMatch(/INSERT INTO schools/im);
  });

  test('uses the stable well-known UUID', () => {
    expect(sql).toMatch(/00000000-0000-0000-0000-000000000001/);
  });

  test('inserts "Default School" as the name', () => {
    expect(sql).toMatch(/['"]Default School['"]/im);
  });

  test('uses ON CONFLICT DO NOTHING (idempotent)', () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/im);
  });
});

// ── school_id FK additions ─────────────────────────────────────────────────────

describe('school_id FK on target tables', () => {
  const tables = ['player_profiles', 'tables', 'playlists', 'scenario_configs'];

  for (const table of tables) {
    test(`${table} receives school_id FK`, () => {
      // Match: ALTER TABLE <table> ... ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools
      const pattern = new RegExp(
        `ALTER TABLE ${table}[^;]*ADD COLUMN IF NOT EXISTS school_id\\s+UUID\\s+REFERENCES schools`,
        'ism'
      );
      expect(sql).toMatch(pattern);
    });
  }

  test('all school_id FKs use ON DELETE SET NULL', () => {
    const matches = sql.match(/school_id\s+UUID\s+REFERENCES schools\(id\)\s+ON DELETE SET NULL/gim);
    expect(matches).toHaveLength(4);
  });
});

// ── Audit columns ──────────────────────────────────────────────────────────────

describe('updated_by added to tables that had created_by', () => {
  const tablesWithCreatedBy = ['player_profiles', 'tables', 'playlists', 'scenario_configs'];

  for (const table of tablesWithCreatedBy) {
    test(`${table} receives updated_by`, () => {
      const pattern = new RegExp(
        `ALTER TABLE ${table}[^;]*ADD COLUMN IF NOT EXISTS updated_by\\s+UUID`,
        'ism'
      );
      expect(sql).toMatch(pattern);
    });
  }
});

describe('created_by and updated_by added to hands and sessions', () => {
  for (const table of ['hands', 'sessions']) {
    test(`${table} receives created_by`, () => {
      const pattern = new RegExp(
        `ALTER TABLE ${table}[^;]*created_by\\s+UUID`,
        'ism'
      );
      expect(sql).toMatch(pattern);
    });

    test(`${table} receives updated_by`, () => {
      const pattern = new RegExp(
        `ALTER TABLE ${table}[^;]*updated_by\\s+UUID`,
        'ism'
      );
      expect(sql).toMatch(pattern);
    });
  }
});

// ── settings table ─────────────────────────────────────────────────────────────

describe('settings table', () => {
  test('creates settings_scope enum', () => {
    expect(sql).toMatch(/CREATE TYPE settings_scope AS ENUM/im);
  });

  test('enum includes all four scope values', () => {
    const enumBlock = sql.match(/CREATE TYPE settings_scope AS ENUM\s*\([^)]+\)/ims)?.[0] || '';
    expect(enumBlock).toMatch(/'org'/);
    expect(enumBlock).toMatch(/'school'/);
    expect(enumBlock).toMatch(/'coach'/);
    expect(enumBlock).toMatch(/'table'/);
  });

  test('CREATE TABLE settings exists', () => {
    expect(sql).toMatch(/CREATE TABLE settings\s*\(/im);
  });

  test('settings has scope column of type settings_scope', () => {
    expect(sql).toMatch(/scope\s+settings_scope\s+NOT NULL/im);
  });

  test('settings has key column', () => {
    expect(sql).toMatch(/key\s+TEXT\s+NOT NULL/im);
  });

  test('settings has JSONB value column', () => {
    expect(sql).toMatch(/value\s+JSONB\s+NOT NULL/im);
  });

  test('settings has unique constraint on (scope, scope_id, key)', () => {
    expect(sql).toMatch(/UNIQUE\s*\(\s*scope\s*,\s*scope_id\s*,\s*key\s*\)/im);
  });

  test('settings has lookup index', () => {
    expect(sql).toMatch(/CREATE INDEX idx_settings_lookup/im);
  });
});

// ── Scenario marketplace fields ────────────────────────────────────────────────

describe('scenario_configs marketplace columns', () => {
  test('owner_id column added', () => {
    expect(sql).toMatch(/owner_id\s+UUID\s+REFERENCES player_profiles\(id\)/im);
  });

  test('is_shareable column added with default false', () => {
    expect(sql).toMatch(/is_shareable\s+BOOLEAN\s+NOT NULL\s+DEFAULT false/im);
  });
});

// ── Referral code ──────────────────────────────────────────────────────────────

describe('referral_code on player_profiles', () => {
  test('referral_code column added', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS referral_code\s+VARCHAR\(40\)/im);
  });

  test('unique partial index created on referral_code', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_referral_code/im);
  });

  test('partial index only applies when referral_code IS NOT NULL', () => {
    expect(sql).toMatch(/WHERE referral_code IS NOT NULL/im);
  });
});
