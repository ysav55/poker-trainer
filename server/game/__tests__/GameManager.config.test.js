'use strict';

/**
 * GameManager.config.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the GL-01 CONFIG_PHASE flow in GameManager.
 *
 * Covers:
 *   1.  openConfigPhase() → config_phase=true, config has default hybrid structure
 *   2.  updateHandConfig() with invalid mode → returns error
 *   3.  updateHandConfig() with valid config → stored in state.config
 *   4.  startGame() after openConfigPhase() + updateHandConfig() (hybrid) → correct pinned cards, phase='preflop'
 *   5.  startGame() with config mode='rng' → ignores config, deals randomly, config_phase cleared
 *   6.  startGame() with duplicate card in config → returns error, phase stays 'waiting'
 *   7.  After startGame with config: config_phase=false, config=null
 *   8.  getPublicState() with config active: coach sees full config.hole_cards, non-coach sees hole_cards={}
 *   9.  resetForNextHand() → _full_board=null, config_phase=false, config=null
 *  10.  Board reveal timing: after startGame with config, phase=preflop → board exposed=[];
 *       after _advanceStreet to flop → board has 3 cards from the pinned board
 */

const GameManager = require('../GameManager');
const { isValidCard } = require('../Deck');

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * makeTable(n) — adds n non-coach players and returns the manager.
 * Players are named p1…pN.
 * Does NOT start the game — caller decides when/how to start.
 */
function makeTable(n) {
  const gm = new GameManager(`test-table-${Math.random()}`);
  for (let i = 1; i <= n; i++) {
    const result = gm.addPlayer(`p${i}`, `Player${i}`);
    expect(result).toHaveProperty('success', true);
  }
  return gm;
}

/**
 * Advance through a full betting round (preflop) so _advanceStreet fires.
 * In a 2-player game:
 *   dealer_seat=0 → p1=dealer+BB, p2=SB, UTG=p2
 *   p2 calls to match BB, then p1 checks → flop.
 */
function advancePreflopToFlop(gm) {
  const first = gm.state.current_turn;
  gm.placeBet(first, 'call');
  const second = gm.state.current_turn;
  gm.placeBet(second, 'check');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 1 — openConfigPhase
// ─────────────────────────────────────────────────────────────────────────────

describe('openConfigPhase()', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
  });

  test('returns { success: true }', () => {
    expect(gm.openConfigPhase()).toEqual({ success: true });
  });

  test('sets config_phase = true', () => {
    gm.openConfigPhase();
    expect(gm.state.config_phase).toBe(true);
  });

  test('initialises config with mode="hybrid"', () => {
    gm.openConfigPhase();
    expect(gm.state.config).not.toBeNull();
    expect(gm.state.config.mode).toBe('hybrid');
  });

  test('initialises config.hole_cards as empty object', () => {
    gm.openConfigPhase();
    expect(gm.state.config.hole_cards).toEqual({});
  });

  test('initialises config.board as 5-element array of nulls', () => {
    gm.openConfigPhase();
    expect(gm.state.config.board).toEqual([null, null, null, null, null]);
  });

  test('config_phase defaults to false before openConfigPhase is called', () => {
    expect(gm.state.config_phase).toBe(false);
  });

  test('config defaults to null before openConfigPhase is called', () => {
    expect(gm.state.config).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 2 — updateHandConfig: invalid mode
// ─────────────────────────────────────────────────────────────────────────────

describe('updateHandConfig() — invalid mode', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
  });

  test('returns error for mode="invalid_mode"', () => {
    const result = gm.updateHandConfig({ mode: 'invalid_mode', hole_cards: {}, board: [] });
    expect(result).toHaveProperty('error');
  });

  test('error message mentions valid modes', () => {
    const result = gm.updateHandConfig({ mode: 'bad', hole_cards: {} });
    expect(result.error).toMatch(/rng|manual|hybrid/i);
  });

  test('returns error when config is null', () => {
    const result = gm.updateHandConfig(null);
    expect(result).toHaveProperty('error');
  });

  test('returns error when config has no mode field', () => {
    const result = gm.updateHandConfig({ hole_cards: {} });
    expect(result).toHaveProperty('error');
  });

  test('state.config is NOT updated after invalid mode call', () => {
    const originalConfig = gm.state.config;
    gm.updateHandConfig({ mode: 'bogus', hole_cards: {} });
    expect(gm.state.config).toEqual(originalConfig);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 3 — updateHandConfig: valid config stored
// ─────────────────────────────────────────────────────────────────────────────

describe('updateHandConfig() — valid config stored', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
  });

  test('returns { success: true } for mode="rng"', () => {
    const result = gm.updateHandConfig({ mode: 'rng', hole_cards: {}, board: [] });
    expect(result).toEqual({ success: true });
  });

  test('returns { success: true } for mode="manual"', () => {
    const result = gm.updateHandConfig({ mode: 'manual', hole_cards: {}, board: [] });
    expect(result).toEqual({ success: true });
  });

  test('returns { success: true } for mode="hybrid"', () => {
    const result = gm.updateHandConfig({ mode: 'hybrid', hole_cards: {}, board: [] });
    expect(result).toEqual({ success: true });
  });

  test('config is stored on state after valid update', () => {
    const newConfig = {
      mode: 'hybrid',
      hole_cards: { p1: ['As', 'Kd'] },
      board: ['Qh', null, null, null, null],
    };
    gm.updateHandConfig(newConfig);
    expect(gm.state.config).toEqual(newConfig);
  });

  test('subsequent updateHandConfig calls overwrite previous config', () => {
    gm.updateHandConfig({ mode: 'manual', hole_cards: { p1: ['Ah', null] }, board: [] });
    const newConfig = { mode: 'hybrid', hole_cards: {}, board: [null, null, null, null, null] };
    gm.updateHandConfig(newConfig);
    expect(gm.state.config.mode).toBe('hybrid');
    expect(gm.state.config.hole_cards).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 4 — startGame after openConfigPhase + updateHandConfig (hybrid)
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — hybrid config with pinned cards', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {
        p1: ['As', 'Kd'],   // pinned
        // p2 gets random cards (no entry → null slots)
      },
      board: ['Qh', null, null, null, null], // board[0] pinned
    });
  });

  test('startGame returns { success: true }', () => {
    expect(gm.startGame()).toEqual({ success: true });
  });

  test('phase becomes preflop', () => {
    gm.startGame();
    expect(gm.state.phase).toBe('preflop');
  });

  test('player p1 receives the pinned hole cards', () => {
    gm.startGame();
    const p1 = gm.state.players.find(p => p.id === 'p1');
    expect(p1.hole_cards).toEqual(['As', 'Kd']);
  });

  test('player p2 receives 2 valid random cards', () => {
    gm.startGame();
    const p2 = gm.state.players.find(p => p.id === 'p2');
    expect(p2.hole_cards).toHaveLength(2);
    for (const card of p2.hole_cards) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test('p2 does not receive the pinned cards', () => {
    gm.startGame();
    const p2 = gm.state.players.find(p => p.id === 'p2');
    expect(p2.hole_cards).not.toContain('As');
    expect(p2.hole_cards).not.toContain('Kd');
  });

  test('_full_board[0] = Qh (pinned board card)', () => {
    gm.startGame();
    expect(gm.state._full_board).not.toBeNull();
    expect(gm.state._full_board[0]).toBe('Qh');
  });

  test('_full_board has exactly 5 cards, all valid', () => {
    gm.startGame();
    expect(gm.state._full_board).toHaveLength(5);
    for (const card of gm.state._full_board) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test('board is empty array after startGame (cards not yet revealed)', () => {
    gm.startGame();
    expect(gm.state.board).toEqual([]);
  });

  test('no duplicate cards across all player hole cards and full board', () => {
    gm.startGame();
    const all = [];
    for (const p of gm.state.players.filter(pl => !pl.is_coach)) {
      all.push(...p.hole_cards);
    }
    all.push(...gm.state._full_board);
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 5 — startGame with config mode='rng'
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — config mode="rng" ignores pinned cards', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    // Set mode=rng but include pinned cards — they should be IGNORED
    gm.updateHandConfig({
      mode: 'rng',
      hole_cards: { p1: ['As', 'Kd'] },
      board: ['Qh', null, null, null, null],
    });
  });

  test('startGame returns { success: true }', () => {
    expect(gm.startGame()).toEqual({ success: true });
  });

  test('phase becomes preflop', () => {
    gm.startGame();
    expect(gm.state.phase).toBe('preflop');
  });

  test('each player receives 2 valid cards (dealt randomly)', () => {
    gm.startGame();
    for (const p of gm.state.players.filter(pl => !pl.is_coach)) {
      expect(p.hole_cards).toHaveLength(2);
      for (const card of p.hole_cards) {
        expect(isValidCard(card)).toBe(true);
      }
    }
  });

  test('config_phase is cleared after rng startGame', () => {
    gm.startGame();
    expect(gm.state.config_phase).toBe(false);
  });

  test('config is null after rng startGame', () => {
    gm.startGame();
    expect(gm.state.config).toBeNull();
  });

  test('_full_board is null in rng mode (board drawn per street)', () => {
    gm.startGame();
    expect(gm.state._full_board).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 6 — startGame with duplicate card in config → error
//
//  ISS-05 FIXED: startGame() now correctly validates hand config before mutating state.
//  After a failed startGame(), phase remains 'waiting' (not 'preflop').
//  The undoAction() path is still available as a fallback.
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — duplicate card in config returns error', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
  });

  test('duplicate in hole_cards returns error object', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {
        p1: ['As', 'Kd'],
        p2: ['As', 'Qh'],  // 'As' duplicated
      },
      board: [null, null, null, null, null],
    });
    const result = gm.startGame();
    expect(result).toHaveProperty('error');
  });

  test('error message mentions hand generation failure', () => {
    gm.updateHandConfig({
      mode: 'manual',
      hole_cards: {
        p1: ['Ah', 'Kh'],
        p2: ['Ah', 'Qd'],  // 'Ah' duplicated
      },
      board: [null, null, null, null, null],
    });
    const result = gm.startGame();
    expect(result.error).toMatch(/hand generation failed/i);
  });

  test('phase remains waiting after failed startGame (ISS-05 fixed)', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {
        p1: ['2h', '2d'],
        p2: ['2h', '3c'],  // '2h' duplicated
      },
      board: [null, null, null, null, null],
    });
    gm.startGame();
    expect(gm.state.phase).toBe('waiting');
  });

  test('phase stays waiting after failed startGame — no undo needed (ISS-05 fixed)', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {
        p1: ['2h', '2d'],
        p2: ['2h', '3c'],  // '2h' duplicated
      },
      board: [null, null, null, null, null],
    });
    const result = gm.startGame();
    // ISS-05 fixed: startGame validates before mutating, so phase stays 'waiting'
    expect(result).toHaveProperty('error');
    expect(gm.state.phase).toBe('waiting');
  });

  test('board card duplicated in hole_cards causes error', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: { p1: ['Ts', 'Js'] },
      board: ['Ts', null, null, null, null], // 'Ts' duplicated
    });
    const result = gm.startGame();
    expect(result).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 7 — After startGame with config: config_phase=false, config=null
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — config phase cleared after successful start', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {},
      board: [null, null, null, null, null],
    });
    gm.startGame();
  });

  test('config_phase is false after startGame', () => {
    expect(gm.state.config_phase).toBe(false);
  });

  test('config is null after startGame', () => {
    expect(gm.state.config).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 8 — getPublicState with config active
// ─────────────────────────────────────────────────────────────────────────────

describe('getPublicState() — config visibility', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {
        p1: ['As', 'Kd'],
        p2: ['Qh', '2c'],
      },
      board: ['Jd', null, null, null, null],
    });
    // Do NOT start the game — config is still active
  });

  test('config_phase=true is exposed in public state', () => {
    const pub = gm.getPublicState('p1', false);
    expect(pub.config_phase).toBe(true);
  });

  test('coach sees full config.hole_cards', () => {
    const pub = gm.getPublicState('coach-1', true);
    expect(pub.config).not.toBeNull();
    expect(pub.config.hole_cards).toEqual({
      p1: ['As', 'Kd'],
      p2: ['Qh', '2c'],
    });
  });

  test('non-coach sees config.hole_cards as empty object {}', () => {
    const pub = gm.getPublicState('p1', false);
    expect(pub.config).not.toBeNull();
    expect(pub.config.hole_cards).toEqual({});
  });

  test('non-coach still sees config.mode and config.board', () => {
    const pub = gm.getPublicState('p1', false);
    expect(pub.config.mode).toBe('hybrid');
    expect(pub.config.board).toEqual(['Jd', null, null, null, null]);
  });

  test('coach sees config unchanged (no mutation)', () => {
    const pub = gm.getPublicState('coach-1', true);
    // Must be the same object/values
    expect(pub.config.mode).toBe('hybrid');
    expect(pub.config.board[0]).toBe('Jd');
  });

  test('when config is null, getPublicState returns config=null', () => {
    gm.state.config = null;
    const pub = gm.getPublicState('p1', false);
    expect(pub.config).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 9 — resetForNextHand
// ─────────────────────────────────────────────────────────────────────────────

describe('resetForNextHand()', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: { p1: ['As', 'Kd'] },
      board: ['Qh', null, null, null, null],
    });
    gm.startGame();
    // Confirm we have _full_board set
    expect(gm.state._full_board).not.toBeNull();
    // Advance to showdown to allow resetForNextHand
    const folder = gm.state.current_turn;
    gm.placeBet(folder, 'fold');
  });

  test('returns { success: true }', () => {
    expect(gm.resetForNextHand()).toEqual({ success: true });
  });

  test('_full_board is null after reset', () => {
    gm.resetForNextHand();
    expect(gm.state._full_board).toBeNull();
  });

  test('config_phase is false after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.config_phase).toBe(false);
  });

  test('config is null after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.config).toBeNull();
  });

  test('phase returns to "waiting" after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.phase).toBe('waiting');
  });

  test('board is cleared after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.board).toEqual([]);
  });

  test('player hole_cards are cleared after reset', () => {
    gm.resetForNextHand();
    for (const p of gm.state.players.filter(pl => !pl.is_coach)) {
      expect(p.hole_cards).toEqual([]);
    }
  });

  test('pot is reset to 0 after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.pot).toBe(0);
  });

  test('street_snapshots are cleared after reset', () => {
    gm.resetForNextHand();
    expect(gm.state.street_snapshots).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 10 — Board reveal timing
// ─────────────────────────────────────────────────────────────────────────────

describe('board reveal timing — config mode', () => {
  let gm;
  const pinnedBoard = ['As', 'Kd', 'Qh', 'Jc', 'Ts'];

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {},
      board: pinnedBoard,
    });
    gm.startGame();
  });

  test('after startGame (preflop), board is empty (no cards exposed yet)', () => {
    expect(gm.state.phase).toBe('preflop');
    expect(gm.state.board).toEqual([]);
  });

  test('getPublicState in preflop exposes 0 board cards', () => {
    const pub = gm.getPublicState('p1', false);
    expect(pub.board).toHaveLength(0);
  });

  test('after advancing to flop, board has exactly 3 cards', () => {
    advancePreflopToFlop(gm);
    expect(gm.state.phase).toBe('flop');
    expect(gm.state.board).toHaveLength(3);
  });

  test('flop board cards match first 3 cards of pinned board', () => {
    advancePreflopToFlop(gm);
    expect(gm.state.board[0]).toBe(pinnedBoard[0]); // As
    expect(gm.state.board[1]).toBe(pinnedBoard[1]); // Kd
    expect(gm.state.board[2]).toBe(pinnedBoard[2]); // Qh
  });

  test('getPublicState at flop exposes exactly 3 board cards', () => {
    advancePreflopToFlop(gm);
    const pub = gm.getPublicState('p1', false);
    expect(pub.board).toHaveLength(3);
  });

  test('after advancing to turn, board has 4 cards', () => {
    advancePreflopToFlop(gm);
    // Advance through flop
    const first = gm.state.current_turn;
    gm.placeBet(first, 'check');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');
    expect(gm.state.phase).toBe('turn');
    expect(gm.state.board).toHaveLength(4);
    expect(gm.state.board[3]).toBe(pinnedBoard[3]); // Jc
  });

  test('after advancing to river, board has 5 cards', () => {
    advancePreflopToFlop(gm);
    // Flop
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    // Turn
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    expect(gm.state.phase).toBe('river');
    expect(gm.state.board).toHaveLength(5);
    expect(gm.state.board[4]).toBe(pinnedBoard[4]); // Ts
  });

  test('full 5-card board matches pinnedBoard entirely', () => {
    advancePreflopToFlop(gm);
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    expect(gm.state.board).toEqual(pinnedBoard);
  });

  test('_full_board is preserved across all streets', () => {
    advancePreflopToFlop(gm);
    expect(gm.state._full_board).toEqual(pinnedBoard);
    gm.placeBet(gm.state.current_turn, 'check');
    gm.placeBet(gm.state.current_turn, 'check');
    expect(gm.state._full_board).toEqual(pinnedBoard);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 11 — startGame without config (baseline rng, no config_phase)
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — no config phase (baseline rng)', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
  });

  test('startGame without openConfigPhase works normally (rng)', () => {
    expect(gm.startGame('rng')).toEqual({ success: true });
    expect(gm.state.phase).toBe('preflop');
  });

  test('config_phase remains false without openConfigPhase', () => {
    gm.startGame('rng');
    expect(gm.state.config_phase).toBe(false);
  });

  test('config remains null without openConfigPhase', () => {
    gm.startGame('rng');
    expect(gm.state.config).toBeNull();
  });

  test('_full_board is null in pure rng mode', () => {
    gm.startGame('rng');
    expect(gm.state._full_board).toBeNull();
  });

  test('each player gets 2 valid hole cards in rng mode', () => {
    gm.startGame('rng');
    for (const p of gm.state.players.filter(pl => !pl.is_coach)) {
      expect(p.hole_cards).toHaveLength(2);
      for (const card of p.hole_cards) {
        expect(isValidCard(card)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 12 — openConfigPhase + manual mode (all cards specified)
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — manual config (all cards specified)', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'manual',
      hole_cards: {
        p1: ['As', 'Kd'],
        p2: ['Qh', '2c'],
      },
      board: ['Jd', 'Th', '9s', '8c', '7h'],
    });
    gm.startGame();
  });

  test('p1 receives exactly the specified hole cards', () => {
    const p1 = gm.state.players.find(p => p.id === 'p1');
    expect(p1.hole_cards).toEqual(['As', 'Kd']);
  });

  test('p2 receives exactly the specified hole cards', () => {
    const p2 = gm.state.players.find(p => p.id === 'p2');
    expect(p2.hole_cards).toEqual(['Qh', '2c']);
  });

  test('_full_board contains exactly the specified board', () => {
    expect(gm.state._full_board).toEqual(['Jd', 'Th', '9s', '8c', '7h']);
  });

  test('no card appears in both hole cards and board', () => {
    const all = [];
    for (const p of gm.state.players.filter(pl => !pl.is_coach)) {
      all.push(...p.hole_cards);
    }
    all.push(...gm.state._full_board);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Suite 13 — Invalid card in config → startGame returns error
//
//  ISS-05 FIXED: Same as Suite 6 — phase correctly stays 'waiting' after failure.
// ─────────────────────────────────────────────────────────────────────────────

describe('startGame() — invalid card in config returns error', () => {
  let gm;

  beforeEach(() => {
    gm = makeTable(2);
    gm.openConfigPhase();
  });

  test('invalid card in hole_cards returns error object', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: { p1: ['ZZ', null] },  // invalid card
      board: [null, null, null, null, null],
    });
    const result = gm.startGame();
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/hand generation failed/i);
  });

  test('phase remains waiting after invalid card error (ISS-05 fixed)', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: { p1: ['ZZ', null] },  // invalid card
      board: [null, null, null, null, null],
    });
    gm.startGame();
    expect(gm.state.phase).toBe('waiting');
  });

  test('invalid card in board returns error object', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: {},
      board: ['INVALID', null, null, null, null],
    });
    const result = gm.startGame();
    expect(result).toHaveProperty('error');
  });

  test('phase stays waiting after invalid card error (ISS-05 fixed)', () => {
    gm.updateHandConfig({
      mode: 'hybrid',
      hole_cards: { p1: ['ZZ', null] },  // invalid card
      board: [null, null, null, null, null],
    });
    const result = gm.startGame();
    expect(result).toHaveProperty('error');
    expect(gm.state.phase).toBe('waiting');
  });
});
