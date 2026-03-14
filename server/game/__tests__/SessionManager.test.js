'use strict';

/**
 * SessionManager — QA-04 Test Suite
 *
 * Covers:
 *  1. Basic construction — empty stats, sessionId set
 *  2. Single hand RNG mode — startGame → dealt-in players set up → resetForNextHand → stats accumulated
 *  3. VPIP tracking — caller gets vpip incremented; checker does not
 *  4. PFR tracking — raiser gets pfr incremented; caller does not
 *  5. Fold-to-one path — winner gets handsWon, no showdown_result
 *  6. Showdown path — WTSD/WSD tracked
 *  7. Ratios — vpip = vpipCount/handsPlayed
 *  8. netChips — current stack minus starting stack
 *  9. Multi-hand accumulation — handsDealt === 3 after 3 hands
 * 10. Player not dealt in (coach/spectator) skipped
 * 11. getSessionStats() shape
 * 12. Proxy methods — addPlayer, removePlayer, placeBet, forceNextStreet delegate correctly
 * 13. startGame error — if gm.startGame returns error, SessionManager propagates it without crash
 * 14. Preflop tracking cleared after hand
 */

const SessionManager = require('../SessionManager');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Create a SessionManager with `playerCount` players already added.
 * All players start with default 1000 stack.
 */
function setupTable(playerCount = 3) {
  const sm = new SessionManager('test-table');
  for (let i = 0; i < playerCount; i++) {
    sm.addPlayer(`player${i + 1}`, `Player ${i + 1}`);
  }
  return sm;
}

/**
 * Play through a hand where all players fold except the first active one.
 * Uses placeBet(id, 'fold') for everyone except the last standing player.
 * Returns the SessionManager after the hand is in showdown state.
 */
function playFoldToOne(sm) {
  const result = sm.startGame('rng');
  expect(result.error).toBeUndefined();

  // Keep folding until only 1 player is active
  const players = sm.gm._gamePlayers();
  let foldCount = 0;
  while (sm.state.phase !== 'showdown' && foldCount < players.length) {
    const currentId = sm.state.current_turn;
    if (!currentId) break;
    sm.placeBet(currentId, 'fold');
    foldCount++;
  }
  return sm;
}

/**
 * Force a hand all the way to showdown using forceNextStreet().
 * Starts the game first, then advances streets until showdown.
 */
function playToShowdown(sm) {
  const result = sm.startGame('rng');
  expect(result.error).toBeUndefined();

  // Force through streets until showdown
  const maxStreets = 5;
  for (let i = 0; i < maxStreets; i++) {
    if (sm.state.phase === 'showdown') break;
    sm.forceNextStreet();
  }
  return sm;
}

// ─────────────────────────────────────────────
//  Suite 1 — Basic construction
// ─────────────────────────────────────────────

describe('SessionManager — construction', () => {
  it('creates with handsDealt = 0', () => {
    const sm = new SessionManager('t1');
    expect(sm.handsDealt).toBe(0);
  });

  it('creates with a sessionId that includes the tableId', () => {
    const sm = new SessionManager('my-table');
    expect(sm.sessionId).toMatch(/my-table/);
  });

  it('creates with empty _stats map', () => {
    const sm = new SessionManager('t1');
    expect(sm._stats.size).toBe(0);
  });

  it('creates with empty _preflopTracking map', () => {
    const sm = new SessionManager('t1');
    expect(sm._preflopTracking.size).toBe(0);
  });

  it('exposes gm as the underlying GameManager', () => {
    const sm = new SessionManager('t1');
    expect(sm.gm).toBeDefined();
    expect(typeof sm.gm.startGame).toBe('function');
  });

  it('state getter delegates to gm.state', () => {
    const sm = new SessionManager('t1');
    expect(sm.state).toBe(sm.gm.state);
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — Single hand RNG mode
// ─────────────────────────────────────────────

describe('SessionManager — single hand lifecycle (RNG)', () => {
  it('startGame succeeds with 2+ players', () => {
    const sm = setupTable(2);
    const result = sm.startGame('rng');
    expect(result).toEqual({ success: true });
  });

  it('after startGame, _preflopTracking has entries for all non-coach players', () => {
    const sm = setupTable(3);
    sm.startGame('rng');
    expect(sm._preflopTracking.size).toBe(3);
  });

  it('after startGame, _stats has entries for all non-coach players', () => {
    const sm = setupTable(3);
    sm.startGame('rng');
    expect(sm._stats.size).toBe(3);
  });

  it('after startGame, all players have hole_cards of length 2', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.gm._gamePlayers().forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
    });
  });

  it('resetForNextHand increments handsDealt', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.forceNextStreet(); // get to showdown quickly
    sm.forceNextStreet();
    sm.forceNextStreet();
    sm.forceNextStreet();
    sm.forceNextStreet();
    sm.resetForNextHand();
    expect(sm.handsDealt).toBe(1);
  });

  it('after resetForNextHand, phase returns to waiting', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.resetForNextHand();
    expect(sm.state.phase).toBe('waiting');
  });

  it('after resetForNextHand, _stats has handsPlayed > 0 for players with hole_cards', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.resetForNextHand();
    const statsValues = Array.from(sm._stats.values());
    statsValues.forEach(s => {
      expect(s.handsPlayed).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — VPIP tracking
// ─────────────────────────────────────────────

describe('SessionManager — VPIP tracking', () => {
  it('call action preflop sets vpipThisHand for that player', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    // The player whose turn it is calls
    const callerId = sm.state.current_turn;
    expect(sm._preflopTracking.get(callerId).vpipThisHand).toBe(false);
    sm.placeBet(callerId, 'call');
    expect(sm._preflopTracking.get(callerId).vpipThisHand).toBe(true);
  });

  it('raise action preflop sets vpipThisHand for that player', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const raiserId = sm.state.current_turn;
    sm.placeBet(raiserId, 'raise', 40);
    expect(sm._preflopTracking.get(raiserId).vpipThisHand).toBe(true);
  });

  it('fold action preflop does NOT set vpipThisHand', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const folderId = sm.state.current_turn;
    sm.placeBet(folderId, 'fold');
    expect(sm._preflopTracking.get(folderId) || { vpipThisHand: false }).toMatchObject({
      vpipThisHand: false
    });
  });

  it('caller has vpip > 0 after endHand if they called preflop', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    // Record who calls first
    const callerId = sm.state.current_turn;
    sm.placeBet(callerId, 'call');

    // Get to end of hand
    sm.resetForNextHand();

    const stats = sm._stats.get(callerId);
    expect(stats._vpipCount).toBeGreaterThanOrEqual(1);
    expect(stats.vpip).toBeGreaterThan(0);
  });

  it('player who only checks preflop has vpip = 0', () => {
    // Need a situation where check is valid preflop — e.g. BB when everyone just calls
    // We need 2 players: p2 is UTG (calls), then p1 is BB (can check since bet is met)
    const sm = new SessionManager('vpip-table');
    sm.addPlayer('p1', 'Player 1');
    sm.addPlayer('p2', 'Player 2');
    sm.startGame('rng');

    // In 2-player heads-up: dealerIdx=0 (p1), sbIdx=1 (p2), bbIdx=0 (p1), utg=1 (p2)
    // p2 acts first (UTG = also small blind in heads-up 2-player)
    // p2 calls (matches BB)
    const utg = sm.state.current_turn; // p2
    sm.placeBet(utg, 'call');

    // Now p1 (BB) can check
    const bb = sm.state.current_turn; // p1
    if (bb) {
      sm.placeBet(bb, 'check');
    }

    sm.resetForNextHand();

    // p1 (BB who checked) should have vpip = 0
    const p1Stats = sm._stats.get('p1');
    if (p1Stats && p1Stats.handsPlayed > 0) {
      expect(p1Stats._vpipCount).toBe(0);
      expect(p1Stats.vpip).toBe(0);
    }
  });

  it('trackPreflopAction does nothing if not in preflop phase', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    // Force to flop
    sm.forceNextStreet();
    expect(sm.state.phase).toBe('flop');

    const playerId = sm.gm._gamePlayers()[0].id;
    // Should not throw and should not modify tracking
    expect(() => sm.trackPreflopAction(playerId, 'call')).not.toThrow();
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — PFR tracking
// ─────────────────────────────────────────────

describe('SessionManager — PFR tracking', () => {
  it('raise action preflop increments _pfrCount after endHand', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const raiserId = sm.state.current_turn;
    sm.placeBet(raiserId, 'raise', 40);
    sm.resetForNextHand();

    const stats = sm._stats.get(raiserId);
    expect(stats._pfrCount).toBeGreaterThanOrEqual(1);
    expect(stats.pfr).toBeGreaterThan(0);
  });

  it('call action preflop does NOT increment _pfrCount', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const callerId = sm.state.current_turn;
    sm.placeBet(callerId, 'call');
    sm.resetForNextHand();

    const stats = sm._stats.get(callerId);
    expect(stats._pfrCount).toBe(0);
    expect(stats.pfr).toBe(0);
  });

  it('_preflopTracking shows pfrThisHand=true for raiser', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const raiserId = sm.state.current_turn;
    sm.placeBet(raiserId, 'raise', 40);
    expect(sm._preflopTracking.get(raiserId).pfrThisHand).toBe(true);
  });

  it('_preflopTracking shows pfrThisHand=false for caller', () => {
    const sm = setupTable(3);
    sm.startGame('rng');

    const callerId = sm.state.current_turn;
    sm.placeBet(callerId, 'call');
    expect(sm._preflopTracking.get(callerId).pfrThisHand).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — Fold-to-one path
// ─────────────────────────────────────────────

describe('SessionManager — fold-to-one path', () => {
  it('winner gets handsWon incremented when everyone else folds', () => {
    const sm = setupTable(3);
    playFoldToOne(sm);

    // The winner should be set on state
    const winnerId = sm.state.winner;
    expect(winnerId).toBeTruthy();

    sm.resetForNextHand();

    const winnerStats = sm._stats.get(winnerId);
    expect(winnerStats.handsWon).toBe(1);
  });

  it('fold-to-one produces no showdown_result at time of resetForNextHand', () => {
    const sm = setupTable(3);
    playFoldToOne(sm);

    // showdown_result should remain null for fold-to-one hands
    expect(sm.state.showdown_result).toBeNull();

    // resetForNextHand should not throw
    expect(() => sm.resetForNextHand()).not.toThrow();
  });

  it('non-winning players do not get handsWon on fold-to-one', () => {
    const sm = setupTable(3);
    playFoldToOne(sm);

    const winnerId = sm.state.winner;
    sm.resetForNextHand();

    sm._stats.forEach((stats, playerId) => {
      if (playerId !== winnerId) {
        expect(stats.handsWon).toBe(0);
      }
    });
  });

  it('phase is showdown after fold-to-one', () => {
    const sm = setupTable(3);
    playFoldToOne(sm);
    expect(sm.state.phase).toBe('showdown');
  });
});

// ─────────────────────────────────────────────
//  Suite 6 — Showdown path (WTSD/WSD)
// ─────────────────────────────────────────────

describe('SessionManager — showdown path (WTSD/WSD)', () => {
  it('players still active at showdown get _wtsdCount incremented', () => {
    const sm = setupTable(2);
    playToShowdown(sm);

    // showdown_result should be set
    expect(sm.state.showdown_result).not.toBeNull();

    sm.resetForNextHand();

    // Both players went to showdown — both should have wtsd > 0
    const statsValues = Array.from(sm._stats.values());
    const withWtsd = statsValues.filter(s => s._wtsdCount > 0);
    expect(withWtsd.length).toBeGreaterThanOrEqual(1);
  });

  it('showdown winner gets handsWon incremented', () => {
    const sm = setupTable(2);
    playToShowdown(sm);

    const winnerId = sm.state.showdown_result.winners[0].playerId;
    sm.resetForNextHand();

    const winnerStats = sm._stats.get(winnerId);
    expect(winnerStats.handsWon).toBe(1);
    expect(winnerStats._wsdCount).toBe(1);
  });

  it('showdown winner has wsd > 0', () => {
    const sm = setupTable(2);
    playToShowdown(sm);

    const winnerId = sm.state.showdown_result.winners[0].playerId;
    sm.resetForNextHand();

    const winnerStats = sm._stats.get(winnerId);
    expect(winnerStats.wsd).toBeGreaterThan(0);
  });

  it('wtsd ratio = 1 when player went to showdown in their only hand', () => {
    const sm = setupTable(2);
    playToShowdown(sm);

    const activePlayers = sm.gm._gamePlayers().filter(p => p.is_active);
    sm.resetForNextHand();

    activePlayers.forEach(p => {
      const stats = sm._stats.get(p.id);
      if (stats.handsPlayed > 0 && stats._wtsdCount > 0) {
        expect(stats.wtsd).toBeCloseTo(stats._wtsdCount / stats.handsPlayed, 5);
      }
    });
  });
});

// ─────────────────────────────────────────────
//  Suite 7 — Ratios after 3 hands
// ─────────────────────────────────────────────

describe('SessionManager — ratios after multiple hands', () => {
  it('vpip = vpipCount / handsPlayed', () => {
    const sm = setupTable(3);

    // Play 3 hands — in each hand, note the UTG player and track VPIP manually
    for (let i = 0; i < 3; i++) {
      sm.startGame('rng');
      // Have UTG call (this is VPIP)
      const utg = sm.state.current_turn;
      sm.placeBet(utg, 'call');
      sm.resetForNextHand();
    }

    // Check that vpip equals _vpipCount / handsPlayed for all players
    sm._stats.forEach(stats => {
      if (stats.handsPlayed > 0) {
        const expected = stats._vpipCount / stats.handsPlayed;
        expect(stats.vpip).toBeCloseTo(expected, 10);
      }
    });
  });

  it('pfr = pfrCount / handsPlayed', () => {
    const sm = setupTable(3);

    for (let i = 0; i < 3; i++) {
      sm.startGame('rng');
      const utg = sm.state.current_turn;
      sm.placeBet(utg, 'raise', 40);
      sm.resetForNextHand();
    }

    sm._stats.forEach(stats => {
      if (stats.handsPlayed > 0) {
        const expected = stats._pfrCount / stats.handsPlayed;
        expect(stats.pfr).toBeCloseTo(expected, 10);
      }
    });
  });

  it('after 3 hands all players who were dealt in have handsPlayed = 3', () => {
    const sm = setupTable(3);

    for (let i = 0; i < 3; i++) {
      sm.startGame('rng');
      sm.resetForNextHand();
    }

    sm._stats.forEach(stats => {
      expect(stats.handsPlayed).toBe(3);
    });
  });

  it('getSessionStats ratios are rounded to 3 decimal places', () => {
    const sm = setupTable(3);

    for (let i = 0; i < 3; i++) {
      sm.startGame('rng');
      const utg = sm.state.current_turn;
      sm.placeBet(utg, 'call');
      sm.resetForNextHand();
    }

    const { players } = sm.getSessionStats();
    players.forEach(p => {
      // Rounded to 3dp means at most 3 decimal places
      const vpipStr = p.vpip.toString();
      const decimals = vpipStr.includes('.') ? vpipStr.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(3);
    });
  });
});

// ─────────────────────────────────────────────
//  Suite 8 — netChips
// ─────────────────────────────────────────────

describe('SessionManager — netChips', () => {
  it('netChips = current stack minus starting stack (both players net to zero-sum)', () => {
    const sm = setupTable(2);
    sm.startGame('rng');

    // Record starting stacks (captured when _ensurePlayerStats first called)
    const players = sm.gm._gamePlayers();
    const startingStacks = {};
    players.forEach(p => {
      startingStacks[p.id] = sm._startingStacks.get(p.id);
    });

    sm.resetForNextHand();

    // netChips should reflect actual change
    players.forEach(p => {
      const stats = sm._stats.get(p.id);
      const expected = p.stack - startingStacks[p.id];
      expect(stats.netChips).toBe(expected);
    });
  });

  it('winner has positive netChips after fold-to-one', () => {
    const sm = setupTable(2);
    playFoldToOne(sm);

    const winnerId = sm.state.winner;
    sm.resetForNextHand();

    const winnerStats = sm._stats.get(winnerId);
    expect(winnerStats.netChips).toBeGreaterThan(0);
  });

  it('net chips across all players sum to zero (chips are conserved)', () => {
    const sm = setupTable(3);
    sm.startGame('rng');
    sm.resetForNextHand();

    let totalNet = 0;
    sm._stats.forEach(stats => {
      totalNet += stats.netChips;
    });
    expect(totalNet).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  Suite 9 — Multi-hand accumulation
// ─────────────────────────────────────────────

describe('SessionManager — multi-hand accumulation', () => {
  it('handsDealt === 3 after 3 hands', () => {
    const sm = setupTable(3);

    for (let i = 0; i < 3; i++) {
      sm.startGame('rng');
      sm.resetForNextHand();
    }

    expect(sm.handsDealt).toBe(3);
  });

  it('getSessionStats().handsDealt matches sm.handsDealt', () => {
    const sm = setupTable(2);

    for (let i = 0; i < 5; i++) {
      sm.startGame('rng');
      sm.resetForNextHand();
    }

    expect(sm.getSessionStats().handsDealt).toBe(5);
    expect(sm.getSessionStats().handsDealt).toBe(sm.handsDealt);
  });

  it('handsPlayed per player accumulates correctly across hands', () => {
    const sm = setupTable(3);

    for (let i = 0; i < 4; i++) {
      sm.startGame('rng');
      sm.resetForNextHand();
    }

    sm._stats.forEach(stats => {
      expect(stats.handsPlayed).toBe(4);
    });
  });
});

// ─────────────────────────────────────────────
//  Suite 10 — Player not dealt in (coach/spectator)
// ─────────────────────────────────────────────

describe('SessionManager — player not dealt in is skipped', () => {
  it('coach (isCoach=true) is now in _gamePlayers and IS tracked in stats after a hand (Epic 12)', () => {
    const sm = new SessionManager('coach-table');
    sm.addPlayer('coach1', 'Coach 1', true);  // coach now gets a real seat
    sm.addPlayer('p1', 'Player 1');
    sm.addPlayer('p2', 'Player 2');

    sm.startGame('rng');
    sm.resetForNextHand();

    // Coach has a real seat → appears in _gamePlayers → tracked in stats
    expect(sm._stats.has('coach1')).toBe(true);
  });

  it('player with empty hole_cards (not dealt in) has handsPlayed not incremented', () => {
    // Simulate a player with no hole_cards by directly manipulating state before endHand
    const sm = setupTable(3);
    sm.startGame('rng');

    // Force one player to have no hole cards (simulating spectator)
    const player3 = sm.gm._gamePlayers()[2];
    player3.hole_cards = [];

    sm.resetForNextHand();

    const stats = sm._stats.get(player3.id);
    // Player with no hole_cards should have handsPlayed = 0
    expect(stats.handsPlayed).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  Suite 11 — getSessionStats() shape
// ─────────────────────────────────────────────

describe('SessionManager — getSessionStats() shape', () => {
  it('returns an object with sessionId, handsDealt, and players array', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.resetForNextHand();

    const stats = sm.getSessionStats();
    expect(stats).toHaveProperty('sessionId');
    expect(stats).toHaveProperty('handsDealt');
    expect(stats).toHaveProperty('players');
    expect(Array.isArray(stats.players)).toBe(true);
  });

  it('each player entry has the required fields', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.resetForNextHand();

    const { players } = sm.getSessionStats();
    expect(players.length).toBeGreaterThan(0);
    players.forEach(p => {
      expect(p).toHaveProperty('playerId');
      expect(p).toHaveProperty('playerName');
      expect(p).toHaveProperty('handsPlayed');
      expect(p).toHaveProperty('handsWon');
      expect(p).toHaveProperty('netChips');
      expect(p).toHaveProperty('vpip');
      expect(p).toHaveProperty('pfr');
      expect(p).toHaveProperty('wtsd');
      expect(p).toHaveProperty('wsd');
    });
  });

  it('internal counters (_vpipCount etc.) are NOT exposed in getSessionStats', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    sm.resetForNextHand();

    const { players } = sm.getSessionStats();
    players.forEach(p => {
      expect(p).not.toHaveProperty('_vpipCount');
      expect(p).not.toHaveProperty('_pfrCount');
      expect(p).not.toHaveProperty('_wtsdCount');
      expect(p).not.toHaveProperty('_wsdCount');
    });
  });

  it('sessionId starts with "session_"', () => {
    const sm = new SessionManager('my-room');
    const { sessionId } = sm.getSessionStats();
    expect(sessionId).toMatch(/^session_my-room_/);
  });
});

// ─────────────────────────────────────────────
//  Suite 12 — Proxy methods
// ─────────────────────────────────────────────

describe('SessionManager — proxy methods delegate to GameManager', () => {
  it('addPlayer adds a player to gm.state.players', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Alice');
    expect(sm.gm.state.players).toHaveLength(1);
    expect(sm.gm.state.players[0].id).toBe('p1');
  });

  it('removePlayer removes a player from gm.state.players', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.removePlayer('p1');
    expect(sm.gm.state.players).toHaveLength(1);
    expect(sm.gm.state.players[0].id).toBe('p2');
  });

  it('placeBet delegates to gm.placeBet and affects game state', () => {
    const sm = setupTable(2);
    sm.startGame('rng');

    const potBefore = sm.state.pot;
    const utg = sm.state.current_turn;
    const result = sm.placeBet(utg, 'call');

    expect(result).toEqual({ success: true });
    // Pot should have changed after call
    expect(sm.state.pot).toBeGreaterThanOrEqual(potBefore);
  });

  it('forceNextStreet delegates to gm.forceNextStreet and advances phase', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    expect(sm.state.phase).toBe('preflop');

    const result = sm.forceNextStreet();
    expect(result).toEqual({ success: true });
    expect(sm.state.phase).toBe('flop');
  });

  it('addPlayer with isCoach=true creates a coach in gm with a real seat', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('coach1', 'Coach', true);
    const player = sm.gm.state.players.find(p => p.id === 'coach1');
    expect(player).toBeDefined();
    expect(player.is_coach).toBe(true);
    expect(player.seat).toBeGreaterThanOrEqual(0);
  });

  it('placeBet error propagates up from gm', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.startGame('rng');

    // Wrong player's turn
    const wrongPlayerId = sm.gm._gamePlayers().find(p => p.id !== sm.state.current_turn).id;
    const result = sm.placeBet(wrongPlayerId, 'call');
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  Suite 13 — startGame error
// ─────────────────────────────────────────────

describe('SessionManager — startGame error handling', () => {
  it('returns error if fewer than 2 players', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Solo');
    const result = sm.startGame('rng');
    expect(result.error).toBeDefined();
  });

  it('does not crash or increment handsDealt on error', () => {
    const sm = new SessionManager('t1');
    // No players added
    expect(() => sm.startGame('rng')).not.toThrow();
    expect(sm.handsDealt).toBe(0);
  });

  it('_preflopTracking stays empty after startGame error', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Solo');
    sm.startGame('rng'); // should error
    expect(sm._preflopTracking.size).toBe(0);
  });

  it('state.phase stays waiting after startGame error', () => {
    const sm = new SessionManager('t1');
    sm.addPlayer('p1', 'Solo');
    sm.startGame('rng');
    // GameManager.startGame with 1 player returns error without mutating phase
    // (behavior depends on GameManager implementation — verify it's safe)
    expect(['waiting']).toContain(sm.state.phase);
  });
});

// ─────────────────────────────────────────────
//  Suite 14 — Preflop tracking cleared after hand
// ─────────────────────────────────────────────

describe('SessionManager — _preflopTracking cleared after resetForNextHand', () => {
  it('_preflopTracking is empty after resetForNextHand', () => {
    const sm = setupTable(3);
    sm.startGame('rng');
    expect(sm._preflopTracking.size).toBe(3); // set up during startGame

    sm.resetForNextHand();
    expect(sm._preflopTracking.size).toBe(0);
  });

  it('_preflopTracking is empty immediately after endHand', () => {
    const sm = setupTable(2);
    sm.startGame('rng');
    expect(sm._preflopTracking.size).toBeGreaterThan(0);

    sm.endHand();
    expect(sm._preflopTracking.size).toBe(0);
  });

  it('tracking from one hand does not bleed into the next hand', () => {
    const sm = setupTable(3);

    // Hand 1: UTG calls (VPIP)
    sm.startGame('rng');
    const utg1 = sm.state.current_turn;
    sm.placeBet(utg1, 'call');
    sm.resetForNextHand();

    // Hand 2: everyone folds quickly
    sm.startGame('rng');
    // Preflop tracking should be freshly initialized — all false
    sm._preflopTracking.forEach(tracking => {
      expect(tracking.vpipThisHand).toBe(false);
      expect(tracking.pfrThisHand).toBe(false);
    });
    sm.resetForNextHand();
  });
});
