'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH
  || path.join(__dirname, '..', '..', 'poker_trainer.sqlite');

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id   TEXT PRIMARY KEY,
      table_id     TEXT NOT NULL,
      started_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hands (
      hand_id            TEXT PRIMARY KEY,
      session_id         TEXT NOT NULL,
      table_id           TEXT NOT NULL,
      started_at         INTEGER NOT NULL,
      ended_at           INTEGER,
      board              TEXT,
      final_pot          INTEGER DEFAULT 0,
      winner_id          TEXT,
      winner_name        TEXT,
      phase_ended        TEXT,
      completed_normally INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );

    CREATE TABLE IF NOT EXISTS hand_players (
      hand_id       TEXT NOT NULL,
      player_id     TEXT NOT NULL,
      player_name   TEXT NOT NULL,
      seat          INTEGER,
      stack_start   INTEGER DEFAULT 0,
      stack_end     INTEGER,
      hole_cards    TEXT,
      is_winner     INTEGER DEFAULT 0,
      vpip          INTEGER DEFAULT 0,
      pfr           INTEGER DEFAULT 0,
      PRIMARY KEY (hand_id, player_id),
      FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
    );

    CREATE TABLE IF NOT EXISTS hand_actions (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id              TEXT NOT NULL,
      player_id            TEXT NOT NULL,
      player_name          TEXT NOT NULL,
      street               TEXT NOT NULL,
      action               TEXT NOT NULL,
      amount               INTEGER DEFAULT 0,
      timestamp            INTEGER NOT NULL,
      is_manual_scenario   INTEGER DEFAULT 0,
      FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hands_session    ON hands(session_id);
    CREATE INDEX IF NOT EXISTS idx_hands_table      ON hands(table_id);
    CREATE INDEX IF NOT EXISTS idx_actions_hand     ON hand_actions(hand_id);
    CREATE INDEX IF NOT EXISTS idx_players_hand     ON hand_players(hand_id);

    CREATE TABLE IF NOT EXISTS playlists (
      playlist_id  TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      table_id     TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_hands (
      playlist_id   TEXT NOT NULL,
      hand_id       TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      added_at      INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, hand_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
      FOREIGN KEY (hand_id)     REFERENCES hands(hand_id)         ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_hands_playlist ON playlist_hands(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_hands_order    ON playlist_hands(playlist_id, display_order);

    CREATE TABLE IF NOT EXISTS player_identities (
      stable_id       TEXT PRIMARY KEY,
      last_known_name TEXT NOT NULL,
      last_seen       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_player_identities_name ON player_identities(last_known_name);
  `);

  // Migration: add is_manual_scenario to existing databases that predate this column
  try {
    _db.exec(`ALTER TABLE hand_actions ADD COLUMN is_manual_scenario INTEGER DEFAULT 0`);
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: add auto_tags (JSON array of auto-detected patterns)
  try { _db.exec(`ALTER TABLE hands ADD COLUMN auto_tags TEXT`); } catch {}
  // Migration: add mistake_tags (JSON array of coach-correction indicators)
  try { _db.exec(`ALTER TABLE hands ADD COLUMN mistake_tags TEXT`); } catch {}
  // Migration: is_reverted — marks an action that was undone by the coach
  try { _db.exec(`ALTER TABLE hand_actions ADD COLUMN is_reverted INTEGER DEFAULT 0`); } catch {}

  // Migrations for Epic 11
  try { _db.exec(`ALTER TABLE hands ADD COLUMN coach_tags TEXT`); } catch {}
  try { _db.exec(`ALTER TABLE hands ADD COLUMN dealer_seat INTEGER DEFAULT 0`); } catch {}
  try { _db.exec(`ALTER TABLE hands ADD COLUMN is_scenario_hand INTEGER DEFAULT 0`); } catch {}

  return _db;
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

module.exports = { getDb, closeDb };
