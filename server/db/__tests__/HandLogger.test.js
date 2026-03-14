'use strict';

// Use in-memory DB for tests — mock Database before requiring HandLogger
jest.mock('../Database', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, table_id TEXT NOT NULL, started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS hands (hand_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, table_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, board TEXT, final_pot INTEGER DEFAULT 0, winner_id TEXT, winner_name TEXT, phase_ended TEXT, completed_normally INTEGER DEFAULT 0, auto_tags TEXT, mistake_tags TEXT, coach_tags TEXT, dealer_seat INTEGER DEFAULT 0, is_scenario_hand INTEGER DEFAULT 0, FOREIGN KEY (session_id) REFERENCES sessions(session_id));
    CREATE TABLE IF NOT EXISTS hand_players (hand_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, seat INTEGER, stack_start INTEGER DEFAULT 0, stack_end INTEGER, hole_cards TEXT, is_winner INTEGER DEFAULT 0, vpip INTEGER DEFAULT 0, pfr INTEGER DEFAULT 0, PRIMARY KEY (hand_id, player_id), FOREIGN KEY (hand_id) REFERENCES hands(hand_id));
    CREATE TABLE IF NOT EXISTS hand_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, hand_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, street TEXT NOT NULL, action TEXT NOT NULL, amount INTEGER DEFAULT 0, timestamp INTEGER NOT NULL, is_manual_scenario INTEGER DEFAULT 0, is_reverted INTEGER DEFAULT 0, FOREIGN KEY (hand_id) REFERENCES hands(hand_id));
    CREATE TABLE IF NOT EXISTS playlists (playlist_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, table_id TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS playlist_hands (playlist_id TEXT NOT NULL, hand_id TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, PRIMARY KEY (playlist_id, hand_id), FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE, FOREIGN KEY (hand_id) REFERENCES hands(hand_id) ON DELETE CASCADE);
  `);
  return { getDb: () => db, closeDb: () => {} };
});

const HandLogger = require('../HandLogger');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDb() {
  return require('../Database').getDb();
}

let _handCounter = 0;
function uid(prefix = 'hand') {
  return `${prefix}-${++_handCounter}-${Date.now()}`;
}

const DEFAULT_PLAYERS = [
  { id: 'p1', name: 'Alice', seat: 0, stack: 1000 },
  { id: 'p2', name: 'Bob',   seat: 1, stack: 1000 },
];

function makeSession(tableId = 'table-1') {
  const sessionId = uid('session');
  return { sessionId, tableId };
}

function startDefaultHand(overrides = {}) {
  const { sessionId, tableId } = makeSession(overrides.tableId);
  const handId = uid('hand');
  HandLogger.startHand({
    handId,
    sessionId,
    tableId,
    players: DEFAULT_PLAYERS,
    ...overrides,
    // re-apply explicit handId/sessionId if provided
    ...(overrides.handId    ? { handId:    overrides.handId    } : { handId }),
    ...(overrides.sessionId ? { sessionId: overrides.sessionId } : { sessionId }),
  });
  return { handId, sessionId, tableId };
}

const SHOWDOWN_STATE = {
  phase: 'showdown',
  board: ['Ah', 'Kd', 'Qc', 'Jh', 'Ts'],
  pot: 200,
  winner: 'p1',
  winner_name: 'Alice',
  players: [
    { id: 'p1', name: 'Alice', stack: 1200, hole_cards: ['As', 'Ks'], action: 'called' },
    { id: 'p2', name: 'Bob',   stack: 800,  hole_cards: ['2h', '3d'], action: 'called' },
  ],
  showdown_result: {
    winners: [{ playerId: 'p1' }],
  },
};

const FOLD_STATE = {
  phase: 'preflop',
  board: [],
  pot: 150,
  winner: 'p2',
  winner_name: 'Bob',
  players: [
    { id: 'p1', name: 'Alice', stack: 850,  hole_cards: [],       action: 'folded' },
    { id: 'p2', name: 'Bob',   stack: 1150, hole_cards: ['5c', '6d'], action: 'raised' },
  ],
  showdown_result: null,
};

// ─── Suite 1: startHand ──────────────────────────────────────────────────────

describe('startHand', () => {
  test('inserts a hand row in the DB', () => {
    const { handId, sessionId, tableId } = startDefaultHand();
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row).not.toBeNull();
    expect(row.hand_id).toBe(handId);
    expect(row.session_id).toBe(sessionId);
    expect(row.table_id).toBe(tableId);
    expect(typeof row.started_at).toBe('number');
    expect(row.completed_normally).toBe(0);
  });

  test('inserts player rows for each player', () => {
    const { handId } = startDefaultHand();
    const db = getDb();
    const rows = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? ORDER BY seat').all(handId);
    expect(rows).toHaveLength(2);
    expect(rows[0].player_id).toBe('p1');
    expect(rows[0].player_name).toBe('Alice');
    expect(rows[0].seat).toBe(0);
    expect(rows[0].stack_start).toBe(1000);
    expect(rows[1].player_id).toBe('p2');
    expect(rows[1].player_name).toBe('Bob');
    expect(rows[1].seat).toBe(1);
    expect(rows[1].stack_start).toBe(1000);
  });

  test('second call with same handId is a no-op (OR IGNORE)', () => {
    const { handId, sessionId, tableId } = startDefaultHand();
    // Call again — should not throw or duplicate
    expect(() => {
      HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });
    }).not.toThrow();
    const db = getDb();
    const hands = db.prepare('SELECT * FROM hands WHERE hand_id = ?').all(handId);
    expect(hands).toHaveLength(1);
    const players = db.prepare('SELECT * FROM hand_players WHERE hand_id = ?').all(handId);
    expect(players).toHaveLength(2);
  });

  test('handles empty players array', () => {
    const { sessionId, tableId } = makeSession();
    const handId = uid('hand');
    expect(() => {
      HandLogger.startHand({ handId, sessionId, tableId, players: [] });
    }).not.toThrow();
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row).not.toBeNull();
    const players = db.prepare('SELECT * FROM hand_players WHERE hand_id = ?').all(handId);
    expect(players).toHaveLength(0);
  });

  test('also inserts a session row (ensureSession)', () => {
    const { sessionId } = startDefaultHand();
    const db = getDb();
    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
    expect(session).not.toBeNull();
  });
});

// ─── Suite 2: recordAction ───────────────────────────────────────────────────

describe('recordAction', () => {
  test('inserts action row with correct fields', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({
      handId, playerId: 'p1', playerName: 'Alice',
      street: 'preflop', action: 'raised', amount: 50,
    });
    const db = getDb();
    const rows = db.prepare('SELECT * FROM hand_actions WHERE hand_id = ?').all(handId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.hand_id).toBe(handId);
    expect(row.player_id).toBe('p1');
    expect(row.player_name).toBe('Alice');
    expect(row.street).toBe('preflop');
    expect(row.action).toBe('raised');
    expect(row.amount).toBe(50);
    expect(typeof row.timestamp).toBe('number');
  });

  test('multiple actions for same hand accumulate', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised',  amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called',  amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'flop',    action: 'checked', amount: 0  });
    const db = getDb();
    const rows = db.prepare('SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id').all(handId);
    expect(rows).toHaveLength(3);
    expect(rows[0].action).toBe('raised');
    expect(rows[1].action).toBe('called');
    expect(rows[2].action).toBe('checked');
  });

  test('action with no amount defaults to 0', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'flop', action: 'checked' });
    const db = getDb();
    const row = db.prepare('SELECT * FROM hand_actions WHERE hand_id = ?').get(handId);
    expect(row.amount).toBe(0);
  });
});

// ─── Suite 3: endHand — normal showdown ─────────────────────────────────────

describe('endHand — normal showdown', () => {
  let handId;

  beforeEach(() => {
    ({ handId } = startDefaultHand());
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
  });

  test('updates hands table: ended_at', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.ended_at).toBeGreaterThan(0);
  });

  test('updates hands table: board as JSON string', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(JSON.parse(row.board)).toEqual(['Ah', 'Kd', 'Qc', 'Jh', 'Ts']);
  });

  test('updates hands table: final_pot, winner_id, winner_name, phase_ended', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.final_pot).toBe(200);
    expect(row.winner_id).toBe('p1');
    expect(row.winner_name).toBe('Alice');
    expect(row.phase_ended).toBe('showdown');
  });

  test('sets completed_normally = 1', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.completed_normally).toBe(1);
  });

  test('updates hand_players: stack_end and hole_cards', () => {
    const db = getDb();
    const p1 = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? AND player_id = ?').get(handId, 'p1');
    const p2 = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? AND player_id = ?').get(handId, 'p2');
    expect(p1.stack_end).toBe(1200);
    expect(JSON.parse(p1.hole_cards)).toEqual(['As', 'Ks']);
    expect(p2.stack_end).toBe(800);
    expect(JSON.parse(p2.hole_cards)).toEqual(['2h', '3d']);
  });

  test('winner is_winner=1, others is_winner=0', () => {
    const db = getDb();
    const p1 = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? AND player_id = ?').get(handId, 'p1');
    const p2 = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? AND player_id = ?').get(handId, 'p2');
    expect(p1.is_winner).toBe(1);
    expect(p2.is_winner).toBe(0);
  });
});

// ─── Suite 4: endHand — fold_to_one ─────────────────────────────────────────

describe('endHand — fold_to_one', () => {
  let handId;

  beforeEach(() => {
    ({ handId } = startDefaultHand());
    HandLogger.endHand({ handId, state: FOLD_STATE });
  });

  test('phase_ended = fold_to_one when state.winner != null and phase != showdown', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.phase_ended).toBe('fold_to_one');
  });

  test('completed_normally = 1 for fold_to_one', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.completed_normally).toBe(1);
  });

  test('winner_id and winner_name set correctly', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.winner_id).toBe('p2');
    expect(row.winner_name).toBe('Bob');
  });

  test('winner player is_winner=1', () => {
    const db = getDb();
    const p2 = db.prepare('SELECT * FROM hand_players WHERE hand_id = ? AND player_id = ?').get(handId, 'p2');
    expect(p2.is_winner).toBe(1);
  });
});

// ─── Suite 5: markIncomplete ─────────────────────────────────────────────────

describe('markIncomplete', () => {
  test('sets completed_normally = 0 for given handId', () => {
    const { handId } = startDefaultHand();
    // First end it normally so completed_normally = 1
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const db = getDb();
    let row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.completed_normally).toBe(1);
    // Now mark incomplete
    HandLogger.markIncomplete(handId);
    row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.completed_normally).toBe(0);
  });

  test('markIncomplete on a fresh hand leaves completed_normally = 0', () => {
    const { handId } = startDefaultHand();
    HandLogger.markIncomplete(handId);
    const db = getDb();
    const row = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId);
    expect(row.completed_normally).toBe(0);
  });

  test('does not affect other hands', () => {
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    HandLogger.endHand({ handId: h1, state: SHOWDOWN_STATE });
    HandLogger.endHand({ handId: h2, state: SHOWDOWN_STATE });
    HandLogger.markIncomplete(h1);
    const db = getDb();
    const r2 = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(h2);
    expect(r2.completed_normally).toBe(1);
  });
});

// ─── Suite 6: getHands ───────────────────────────────────────────────────────

describe('getHands', () => {
  test('returns empty array when no hands for a specific table', () => {
    const results = HandLogger.getHands({ tableId: 'nonexistent-table-xyz' });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  test('returns hands sorted by started_at DESC', () => {
    const tableId = `sort-table-${uid('t')}`;
    const s = makeSession(tableId);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const handId = uid('hand');
      ids.push(handId);
      HandLogger.startHand({ handId, sessionId: s.sessionId, tableId, players: [] });
    }
    const results = HandLogger.getHands({ tableId });
    // started_at should be non-increasing
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].started_at).toBeGreaterThanOrEqual(results[i].started_at);
    }
    expect(results).toHaveLength(3);
  });

  test('respects limit', () => {
    const tableId = `limit-table-${uid('t')}`;
    const s = makeSession(tableId);
    for (let i = 0; i < 5; i++) {
      HandLogger.startHand({ handId: uid('hand'), sessionId: s.sessionId, tableId, players: [] });
    }
    const results = HandLogger.getHands({ tableId, limit: 2 });
    expect(results).toHaveLength(2);
  });

  test('respects offset', () => {
    const tableId = `offset-table-${uid('t')}`;
    const s = makeSession(tableId);
    for (let i = 0; i < 5; i++) {
      HandLogger.startHand({ handId: uid('hand'), sessionId: s.sessionId, tableId, players: [] });
    }
    const all    = HandLogger.getHands({ tableId, limit: 5,  offset: 0 });
    const paged  = HandLogger.getHands({ tableId, limit: 5,  offset: 2 });
    expect(paged).toHaveLength(3);
    expect(paged[0].hand_id).toBe(all[2].hand_id);
  });

  test('filters by tableId when provided', () => {
    const tableA = `filter-table-A-${uid('t')}`;
    const tableB = `filter-table-B-${uid('t')}`;
    const sA = makeSession(tableA);
    const sB = makeSession(tableB);
    HandLogger.startHand({ handId: uid('hand'), sessionId: sA.sessionId, tableId: tableA, players: [] });
    HandLogger.startHand({ handId: uid('hand'), sessionId: sB.sessionId, tableId: tableB, players: [] });
    const resultsA = HandLogger.getHands({ tableId: tableA });
    expect(resultsA.every(r => r.table_id === tableA)).toBe(true);
  });

  test('returns array when no tableId filter (global)', () => {
    const results = HandLogger.getHands({ limit: 5, offset: 0 });
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── Suite 7: getHandDetail ──────────────────────────────────────────────────

describe('getHandDetail', () => {
  test('returns null for non-existent handId', () => {
    const result = HandLogger.getHandDetail('does-not-exist-99999');
    expect(result).toBeNull();
  });

  test('returns hand object with players array and actions array', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 50 });
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const detail = HandLogger.getHandDetail(handId);
    expect(detail).not.toBeNull();
    expect(detail.hand_id).toBe(handId);
    expect(Array.isArray(detail.players)).toBe(true);
    expect(Array.isArray(detail.actions)).toBe(true);
    expect(detail.players).toHaveLength(2);
    expect(detail.actions).toHaveLength(1);
  });

  test('board is parsed as JS array (not JSON string)', () => {
    const { handId } = startDefaultHand();
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const detail = HandLogger.getHandDetail(handId);
    expect(Array.isArray(detail.board)).toBe(true);
    expect(detail.board).toEqual(['Ah', 'Kd', 'Qc', 'Jh', 'Ts']);
  });

  test('board is empty array for hand with no board set', () => {
    const { handId } = startDefaultHand();
    // Don't call endHand, board column is NULL
    const detail = HandLogger.getHandDetail(handId);
    expect(Array.isArray(detail.board)).toBe(true);
    expect(detail.board).toEqual([]);
  });

  test('hole_cards in players is parsed as JS array', () => {
    const { handId } = startDefaultHand();
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const detail = HandLogger.getHandDetail(handId);
    const alice = detail.players.find(p => p.player_id === 'p1');
    expect(Array.isArray(alice.hole_cards)).toBe(true);
    expect(alice.hole_cards).toEqual(['As', 'Ks']);
  });

  test('hole_cards defaults to empty array when not set', () => {
    const { handId } = startDefaultHand();
    // No endHand — hole_cards column is NULL
    const detail = HandLogger.getHandDetail(handId);
    for (const p of detail.players) {
      expect(Array.isArray(p.hole_cards)).toBe(true);
      expect(p.hole_cards).toEqual([]);
    }
  });

  test('actions are ordered by id (insertion order)', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised',  amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called',  amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'flop',    action: 'checked', amount: 0  });
    const detail = HandLogger.getHandDetail(handId);
    expect(detail.actions[0].action).toBe('raised');
    expect(detail.actions[1].action).toBe('called');
    expect(detail.actions[2].action).toBe('checked');
  });
});

// ─── Suite 8: getSessionStats ────────────────────────────────────────────────

describe('getSessionStats', () => {
  test('returns empty array when no hands for session', () => {
    const result = HandLogger.getSessionStats('session-nonexistent-99999');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('counts hands_played correctly', () => {
    const { sessionId, tableId } = makeSession();
    // Play 3 hands
    for (let i = 0; i < 3; i++) {
      const handId = uid('hand');
      HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });
      HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    }
    const stats = HandLogger.getSessionStats(sessionId);
    const alice = stats.find(s => s.player_id === 'p1');
    const bob   = stats.find(s => s.player_id === 'p2');
    expect(alice.hands_played).toBe(3);
    expect(bob.hands_played).toBe(3);
  });

  test('sums net_chips (stack_end - stack_start)', () => {
    const { sessionId, tableId } = makeSession();
    const handId = uid('hand');
    HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    // Alice: start=1000, end=1200 → net=+200
    // Bob:   start=1000, end=800  → net=-200
    const stats = HandLogger.getSessionStats(sessionId);
    const alice = stats.find(s => s.player_id === 'p1');
    const bob   = stats.find(s => s.player_id === 'p2');
    expect(alice.net_chips).toBe(200);
    expect(bob.net_chips).toBe(-200);
  });

  test('computes vpip ratio correctly', () => {
    const { sessionId, tableId } = makeSession();
    // 2 hands: Alice called in hand 1, no action (null) in hand 2
    const h1 = uid('hand');
    HandLogger.startHand({ handId: h1, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({
      handId: h1,
      state: {
        ...SHOWDOWN_STATE,
        players: [
          { id: 'p1', name: 'Alice', stack: 1200, hole_cards: ['As', 'Ks'], action: 'called' },
          { id: 'p2', name: 'Bob',   stack: 800,  hole_cards: ['2h', '3d'], action: 'folded' },
        ],
      },
    });
    const h2 = uid('hand');
    HandLogger.startHand({ handId: h2, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({
      handId: h2,
      state: {
        ...SHOWDOWN_STATE,
        players: [
          { id: 'p1', name: 'Alice', stack: 900,  hole_cards: [], action: 'folded' },
          { id: 'p2', name: 'Bob',   stack: 1100, hole_cards: [], action: 'raised' },
        ],
        winner: 'p2', winner_name: 'Bob',
        showdown_result: { winners: [{ playerId: 'p2' }] },
      },
    });
    const stats = HandLogger.getSessionStats(sessionId);
    const alice = stats.find(s => s.player_id === 'p1');
    const bob   = stats.find(s => s.player_id === 'p2');
    // Alice vpip: 1 out of 2 = 0.5
    expect(alice.vpip).toBeCloseTo(0.5, 3);
    // Bob vpip: 1 out of 2 = 0.5
    expect(bob.vpip).toBeCloseTo(0.5, 3);
  });

  test('computes pfr ratio correctly', () => {
    const { sessionId, tableId } = makeSession();
    const h1 = uid('hand');
    HandLogger.startHand({ handId: h1, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({
      handId: h1,
      state: {
        ...SHOWDOWN_STATE,
        players: [
          { id: 'p1', name: 'Alice', stack: 1200, hole_cards: ['As', 'Ks'], action: 'raised' },
          { id: 'p2', name: 'Bob',   stack: 800,  hole_cards: ['2h', '3d'], action: 'called' },
        ],
      },
    });
    const h2 = uid('hand');
    HandLogger.startHand({ handId: h2, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({
      handId: h2,
      state: {
        ...SHOWDOWN_STATE,
        players: [
          { id: 'p1', name: 'Alice', stack: 900,  hole_cards: [], action: 'called' },
          { id: 'p2', name: 'Bob',   stack: 1100, hole_cards: [], action: 'raised' },
        ],
        winner: 'p2', winner_name: 'Bob',
        showdown_result: { winners: [{ playerId: 'p2' }] },
      },
    });
    const stats = HandLogger.getSessionStats(sessionId);
    const alice = stats.find(s => s.player_id === 'p1');
    // Alice pfr: 1 raise out of 2 hands = 0.5
    expect(alice.pfr).toBeCloseTo(0.5, 3);
  });

  test('returns player_id, player_name, hands_played, hands_won, net_chips, vpip, pfr fields', () => {
    const { sessionId, tableId } = makeSession();
    const handId = uid('hand');
    HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const stats = HandLogger.getSessionStats(sessionId);
    expect(stats.length).toBeGreaterThan(0);
    const row = stats[0];
    expect(row).toHaveProperty('player_id');
    expect(row).toHaveProperty('player_name');
    expect(row).toHaveProperty('hands_played');
    expect(row).toHaveProperty('hands_won');
    expect(row).toHaveProperty('net_chips');
    expect(row).toHaveProperty('vpip');
    expect(row).toHaveProperty('pfr');
  });
});

// ─── Suite 9: full hand flow integration ────────────────────────────────────

describe('full hand flow integration', () => {
  test('startHand → recordAction × 3 → endHand → getHandDetail returns complete hand', () => {
    const { sessionId, tableId } = makeSession();
    const handId = uid('hand');

    // 1. Start
    HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });

    // 2. Record 3 actions
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised',  amount: 100 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called',  amount: 100 });
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'flop',    action: 'checked', amount: 0   });

    // 3. End (showdown)
    HandLogger.endHand({
      handId,
      state: {
        phase: 'showdown',
        board: ['2c', '5h', '9d', 'Kc', 'As'],
        pot: 200,
        winner: 'p1',
        winner_name: 'Alice',
        players: [
          { id: 'p1', name: 'Alice', stack: 1200, hole_cards: ['Ac', 'Ad'], action: 'raised' },
          { id: 'p2', name: 'Bob',   stack: 800,  hole_cards: ['3s', '4h'], action: 'called' },
        ],
        showdown_result: { winners: [{ playerId: 'p1' }] },
      },
    });

    // 4. Retrieve detail
    const detail = HandLogger.getHandDetail(handId);

    expect(detail).not.toBeNull();
    expect(detail.hand_id).toBe(handId);
    expect(detail.session_id).toBe(sessionId);
    expect(detail.table_id).toBe(tableId);
    expect(detail.phase_ended).toBe('showdown');
    expect(detail.completed_normally).toBe(1);
    expect(detail.final_pot).toBe(200);
    expect(detail.winner_name).toBe('Alice');

    // Board parsed
    expect(Array.isArray(detail.board)).toBe(true);
    expect(detail.board).toEqual(['2c', '5h', '9d', 'Kc', 'As']);

    // Players
    expect(detail.players).toHaveLength(2);
    const alice = detail.players.find(p => p.player_id === 'p1');
    const bob   = detail.players.find(p => p.player_id === 'p2');
    expect(alice.is_winner).toBe(1);
    expect(alice.stack_end).toBe(1200);
    expect(Array.isArray(alice.hole_cards)).toBe(true);
    expect(alice.hole_cards).toEqual(['Ac', 'Ad']);
    expect(bob.is_winner).toBe(0);
    expect(bob.stack_end).toBe(800);

    // Actions
    expect(detail.actions).toHaveLength(3);
    expect(detail.actions[0].action).toBe('raised');
    expect(detail.actions[0].amount).toBe(100);
    expect(detail.actions[1].action).toBe('called');
    expect(detail.actions[2].street).toBe('flop');
    expect(detail.actions[2].action).toBe('checked');
  });

  test('markIncomplete then getHandDetail shows completed_normally=0', () => {
    const { handId } = startDefaultHand();
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    HandLogger.markIncomplete(handId);
    const detail = HandLogger.getHandDetail(handId);
    expect(detail.completed_normally).toBe(0);
  });

  test('getSessionStats reflects integration hand results', () => {
    const { sessionId, tableId } = makeSession();
    const handId = uid('hand');
    HandLogger.startHand({ handId, sessionId, tableId, players: DEFAULT_PLAYERS });
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 100 });
    HandLogger.endHand({
      handId,
      state: {
        phase: 'showdown',
        board: ['2c', '5h', '9d'],
        pot: 200,
        winner: 'p1',
        winner_name: 'Alice',
        players: [
          { id: 'p1', name: 'Alice', stack: 1200, hole_cards: ['Ac', 'Ad'], action: 'raised' },
          { id: 'p2', name: 'Bob',   stack: 800,  hole_cards: ['3s', '4h'], action: 'called' },
        ],
        showdown_result: { winners: [{ playerId: 'p1' }] },
      },
    });
    const stats = HandLogger.getSessionStats(sessionId);
    const alice = stats.find(s => s.player_id === 'p1');
    expect(alice.hands_played).toBe(1);
    expect(alice.hands_won).toBe(1);
    expect(alice.net_chips).toBe(200);
    expect(alice.pfr).toBeCloseTo(1.0, 3);
  });
});

// ─── Suite 10: markLastActionReverted ────────────────────────────────────────

describe('markLastActionReverted', () => {
  test('marks the most recent non-reverted action as reverted', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called', amount: 50 });
    HandLogger.markLastActionReverted(handId);
    const db = getDb();
    const rows = db.prepare('SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id').all(handId);
    expect(rows[0].is_reverted).toBe(0);
    expect(rows[1].is_reverted).toBe(1);
  });

  test('calling twice marks two different actions', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 50 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called', amount: 50 });
    HandLogger.markLastActionReverted(handId);
    HandLogger.markLastActionReverted(handId);
    const db = getDb();
    const rows = db.prepare('SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id').all(handId);
    expect(rows[0].is_reverted).toBe(1);
    expect(rows[1].is_reverted).toBe(1);
  });

  test('does nothing when no actions exist', () => {
    const { handId } = startDefaultHand();
    expect(() => HandLogger.markLastActionReverted(handId)).not.toThrow();
  });
});

// ─── Suite 11: analyzeAndTagHand ─────────────────────────────────────────────

describe('analyzeAndTagHand', () => {
  test('returns undefined for non-existent handId', () => {
    const result = HandLogger.analyzeAndTagHand('does-not-exist-xyz');
    expect(result).toBeUndefined();
  });

  test('detects WALK: all preflop folds, no raises', () => {
    const { handId, sessionId, tableId } = startDefaultHand();
    // Three players fold preflop, no raises — BB walks
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'folded', amount: 0 });
    HandLogger.endHand({ handId, state: { ...FOLD_STATE, winner: 'p2', winner_name: 'Bob' } });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.auto_tags).toContain('WALK');
  });

  test('detects WHALE_POT when final_pot > 3000', () => {
    const { handId } = startDefaultHand();
    HandLogger.endHand({
      handId,
      state: {
        phase: 'showdown',
        board: ['Ah', 'Kd', 'Qc', 'Jh', 'Ts'],
        pot: 5000,
        winner: 'p1',
        winner_name: 'Alice',
        players: [
          { id: 'p1', name: 'Alice', stack: 6000, hole_cards: ['As', 'Ks'], action: 'called' },
          { id: 'p2', name: 'Bob',   stack: 0,    hole_cards: ['2h', '3d'], action: 'called' },
        ],
        showdown_result: { winners: [{ playerId: 'p1' }] },
      }
    });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.auto_tags).toContain('WHALE_POT');
  });

  test('does NOT tag WHALE_POT when pot is small', () => {
    const { handId } = startDefaultHand();
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE }); // pot=200
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.auto_tags).not.toContain('WHALE_POT');
  });

  test('detects UNDO_USED when any action is reverted', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 50 });
    HandLogger.markLastActionReverted(handId);
    HandLogger.endHand({ handId, state: FOLD_STATE });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.mistake_tags).toContain('UNDO_USED');
  });

  test('does NOT tag UNDO_USED when no actions reverted', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 50 });
    HandLogger.endHand({ handId, state: FOLD_STATE });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.mistake_tags).not.toContain('UNDO_USED');
  });

  test('detects 3BET_POT when 3+ preflop raises', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 40 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'raised', amount: 120 });
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 360 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called', amount: 360 });
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.auto_tags).toContain('3BET_POT');
  });

  test('does NOT detect 3BET_POT with only 1 raise', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'raised', amount: 40 });
    HandLogger.recordAction({ handId, playerId: 'p2', playerName: 'Bob',   street: 'preflop', action: 'called', amount: 40 });
    HandLogger.endHand({ handId, state: SHOWDOWN_STATE });
    const result = HandLogger.analyzeAndTagHand(handId);
    expect(result.auto_tags).not.toContain('3BET_POT');
  });

  test('persists auto_tags and mistake_tags to the DB', () => {
    const { handId } = startDefaultHand();
    HandLogger.recordAction({ handId, playerId: 'p1', playerName: 'Alice', street: 'preflop', action: 'folded', amount: 0 });
    HandLogger.endHand({ handId, state: FOLD_STATE });
    HandLogger.analyzeAndTagHand(handId);
    const db = getDb();
    const row = db.prepare('SELECT auto_tags, mistake_tags FROM hands WHERE hand_id = ?').get(handId);
    expect(row.auto_tags).not.toBeNull();
    const tags = JSON.parse(row.auto_tags);
    expect(Array.isArray(tags)).toBe(true);
  });
});

// ─── Suite 12: Playlist CRUD ─────────────────────────────────────────────────

describe('Playlist CRUD', () => {
  test('createPlaylist returns playlist with playlist_id', () => {
    const pl = HandLogger.createPlaylist({ name: 'My Playlist', description: 'Test', tableId: 'table-1' });
    expect(pl.playlist_id).toBeTruthy();
    expect(pl.name).toBe('My Playlist');
    expect(pl.description).toBe('Test');
    expect(pl.table_id).toBe('table-1');
  });

  test('getPlaylists returns all playlists', () => {
    const before = HandLogger.getPlaylists().length;
    HandLogger.createPlaylist({ name: 'PL-A' });
    HandLogger.createPlaylist({ name: 'PL-B' });
    const after = HandLogger.getPlaylists();
    expect(after.length).toBeGreaterThanOrEqual(before + 2);
  });

  test('getPlaylists filters by tableId', () => {
    const tableX = `playlist-table-X-${uid('t')}`;
    const tableY = `playlist-table-Y-${uid('t')}`;
    HandLogger.createPlaylist({ name: 'ForX', tableId: tableX });
    HandLogger.createPlaylist({ name: 'ForY', tableId: tableY });
    const forX = HandLogger.getPlaylists({ tableId: tableX });
    expect(forX.every(p => p.table_id === tableX)).toBe(true);
    expect(forX.length).toBeGreaterThanOrEqual(1);
  });

  test('addHandToPlaylist adds a hand and returns display_order=0 for first', () => {
    const pl = HandLogger.createPlaylist({ name: 'Test Add' });
    const { handId } = startDefaultHand();
    const result = HandLogger.addHandToPlaylist(pl.playlist_id, handId);
    expect(result.display_order).toBe(0);
    expect(result.playlist_id).toBe(pl.playlist_id);
    expect(result.hand_id).toBe(handId);
  });

  test('addHandToPlaylist increments display_order for subsequent hands', () => {
    const pl = HandLogger.createPlaylist({ name: 'Test Order' });
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    const { handId: h3 } = startDefaultHand();
    const r1 = HandLogger.addHandToPlaylist(pl.playlist_id, h1);
    const r2 = HandLogger.addHandToPlaylist(pl.playlist_id, h2);
    const r3 = HandLogger.addHandToPlaylist(pl.playlist_id, h3);
    expect(r1.display_order).toBe(0);
    expect(r2.display_order).toBe(1);
    expect(r3.display_order).toBe(2);
  });

  test('getPlaylistHands returns hands in display_order ASC', () => {
    const pl = HandLogger.createPlaylist({ name: 'Test GetHands' });
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, h1);
    HandLogger.addHandToPlaylist(pl.playlist_id, h2);
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(hands).toHaveLength(2);
    expect(hands[0].hand_id).toBe(h1);
    expect(hands[1].hand_id).toBe(h2);
    expect(hands[0].display_order).toBe(0);
    expect(hands[1].display_order).toBe(1);
  });

  test('getPlaylistHands returns empty array for empty playlist', () => {
    const pl = HandLogger.createPlaylist({ name: 'Empty' });
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(hands).toEqual([]);
  });

  test('getPlaylistHands parses auto_tags as array', () => {
    const pl = HandLogger.createPlaylist({ name: 'Tags Test' });
    const { handId } = startDefaultHand();
    HandLogger.endHand({ handId, state: FOLD_STATE });
    // Manually set auto_tags on the hand
    const db = getDb();
    db.prepare('UPDATE hands SET auto_tags = ? WHERE hand_id = ?').run('["WALK"]', handId);
    HandLogger.addHandToPlaylist(pl.playlist_id, handId);
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(Array.isArray(hands[0].auto_tags)).toBe(true);
    expect(hands[0].auto_tags).toContain('WALK');
  });

  test('removeHandFromPlaylist removes the hand', () => {
    const pl = HandLogger.createPlaylist({ name: 'Remove Test' });
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, h1);
    HandLogger.addHandToPlaylist(pl.playlist_id, h2);
    HandLogger.removeHandFromPlaylist(pl.playlist_id, h1);
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(hands).toHaveLength(1);
    expect(hands[0].hand_id).toBe(h2);
  });

  test('removeHandFromPlaylist compacts display_order', () => {
    const pl = HandLogger.createPlaylist({ name: 'Compact Test' });
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    const { handId: h3 } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, h1);
    HandLogger.addHandToPlaylist(pl.playlist_id, h2);
    HandLogger.addHandToPlaylist(pl.playlist_id, h3);
    // Remove the middle hand
    HandLogger.removeHandFromPlaylist(pl.playlist_id, h2);
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(hands).toHaveLength(2);
    // display_order should be 0 and 1 (no gap)
    expect(hands[0].display_order).toBe(0);
    expect(hands[1].display_order).toBe(1);
    expect(hands[0].hand_id).toBe(h1);
    expect(hands[1].hand_id).toBe(h3);
  });

  test('deletePlaylist removes the playlist and cascades to playlist_hands', () => {
    const pl = HandLogger.createPlaylist({ name: 'Delete Test' });
    const { handId } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, handId);
    HandLogger.deletePlaylist(pl.playlist_id);
    const db = getDb();
    const plRow = db.prepare('SELECT * FROM playlists WHERE playlist_id = ?').get(pl.playlist_id);
    expect(plRow).toBeUndefined();
    const phRows = db.prepare('SELECT * FROM playlist_hands WHERE playlist_id = ?').all(pl.playlist_id);
    expect(phRows).toHaveLength(0);
  });

  test('getPlaylists includes hand_count', () => {
    const pl = HandLogger.createPlaylist({ name: 'Count Test' });
    const { handId: h1 } = startDefaultHand();
    const { handId: h2 } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, h1);
    HandLogger.addHandToPlaylist(pl.playlist_id, h2);
    const lists = HandLogger.getPlaylists();
    const found = lists.find(p => p.playlist_id === pl.playlist_id);
    expect(found).toBeDefined();
    expect(found.hand_count).toBe(2);
  });

  test('addHandToPlaylist is idempotent (INSERT OR IGNORE)', () => {
    const pl = HandLogger.createPlaylist({ name: 'Idempotent Test' });
    const { handId } = startDefaultHand();
    HandLogger.addHandToPlaylist(pl.playlist_id, handId);
    expect(() => HandLogger.addHandToPlaylist(pl.playlist_id, handId)).not.toThrow();
    const hands = HandLogger.getPlaylistHands(pl.playlist_id);
    expect(hands).toHaveLength(1);
  });
});
