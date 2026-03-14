'use strict';

/**
 * QA Checklist Tests — Poker Training Simulator Edge Cases
 *
 *  1a. "Impossible Deck"         — duplicate card detection
 *  1b. Undo at Showdown          — revert after cards revealed / pot awarded
 *  1d. Dynamic Stack Reset       — block / allow below committed chips
 *  2a. Reconnect Sync            — state after mid-hand rejoin
 *  2c. Simultaneous Actions      — sequential processing, out-of-turn rejection
 *  3a. Multi-Way Side Pots       — 100 / 500 / 1000 all-in
 *  3b. Under-Raise All-In        — re-raise blocking after incomplete all-in
 *  3c. Odd-Chip Distribution     — closest to SB clockwise
 */

const GameManager      = require('../GameManager');
const { generateHand } = require('../HandGenerator');
const { buildSidePots }= require('../SidePotCalculator');

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTable(numPlayers = 3) {
  const gm = new GameManager('qa-table');
  for (let i = 0; i < numPlayers; i++) {
    gm.addPlayer(`p${i + 1}`, `Player${i + 1}`);
  }
  return gm;
}

function startGame(gm) {
  const r = gm.startGame('rng');
  expect(r.error).toBeUndefined();
  return gm._gamePlayers();
}

function advanceTo(gm, targetPhase) {
  const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  while (gm.state.phase !== targetPhase && gm.state.phase !== 'showdown') {
    const r = gm.forceNextStreet();
    if (r.error) break;
  }
}

// ─── 1a. "Impossible Deck" ───────────────────────────────────────────────────

describe('1a — "Impossible Deck": duplicate card detection', () => {
  test('same card assigned to two different players is rejected', () => {
    const r = generateHand(
      { mode: 'manual', hole_cards: { p1: ['As', 'Kh'], p2: ['As', 'Qd'] },
        board: [null, null, null, null, null] },
      ['p1', 'p2'], []
    );
    expect(r.error).toBeTruthy();
  });

  test('same card in player and board is rejected', () => {
    const r = generateHand(
      { mode: 'manual', hole_cards: { p1: ['As', 'Kh'] },
        board: ['As', null, null, null, null] },
      ['p1'], []
    );
    expect(r.error).toBeTruthy();
  });

  test('duplicate within board is rejected', () => {
    const r = generateHand(
      { mode: 'manual', hole_cards: {},
        board: ['2c', '3d', '2c', null, null] },
      [], []
    );
    expect(r.error).toBeTruthy();
  });

  test('same card twice in one player\'s hole cards is rejected', () => {
    const r = generateHand(
      { mode: 'manual', hole_cards: { p1: ['Ac', 'Ac'] },
        board: [null, null, null, null, null] },
      ['p1'], []
    );
    expect(r.error).toBeTruthy();
  });

  test('valid all-unique config succeeds', () => {
    const r = generateHand(
      { mode: 'manual', hole_cards: { p1: ['As', 'Kh'], p2: ['Qd', 'Jc'] },
        board: ['Td', '9s', '8h', '2c', '3d'] },
      ['p1', 'p2'], []
    );
    expect(r.error).toBeUndefined();
    expect(r.hand).toBeDefined();
  });

  test('GameManager startGame blocks on duplicate config', () => {
    const gm = makeTable(2);
    gm.openConfigPhase();
    gm.updateHandConfig({
      mode: 'manual',
      hole_cards: { p1: ['As', 'Kh'], p2: ['As', 'Qd'] },
      board: [null, null, null, null, null]
    });
    const r = gm.startGame();
    expect(r.error).toBeTruthy();
    expect(gm.state.phase).toBe('waiting');
  });
});

// ─── 1b. Undo at Showdown ────────────────────────────────────────────────────

describe('1b — Undo at Showdown: revert after cards revealed and pot awarded', () => {
  test('undo after forceNextStreet to showdown reverts phase to river', () => {
    const gm = makeTable(2);
    startGame(gm);
    advanceTo(gm, 'river');
    if (gm.state.phase !== 'river') return;

    const potBeforeShowdown = gm.state.pot;
    gm.forceNextStreet(); // → showdown, _resolveShowdown called
    expect(gm.state.phase).toBe('showdown');

    const r = gm.undoAction();
    expect(r.error).toBeUndefined();
    expect(gm.state.phase).toBe('river');
    expect(gm.state.pot).toBe(potBeforeShowdown);
  });

  test('stacks revert to pre-showdown values after undo', () => {
    const gm = makeTable(2);
    startGame(gm);
    advanceTo(gm, 'river');
    if (gm.state.phase !== 'river') return;

    const stacksBefore = Object.fromEntries(gm._gamePlayers().map(p => [p.id, p.stack]));
    gm.forceNextStreet();
    gm.undoAction();
    gm._gamePlayers().forEach(p => {
      expect(p.stack).toBe(stacksBefore[p.id]);
    });
  });

  test('showdown_result is null after undo', () => {
    const gm = makeTable(2);
    startGame(gm);
    advanceTo(gm, 'river');
    if (gm.state.phase !== 'river') return;

    gm.forceNextStreet();
    expect(gm.state.showdown_result).not.toBeNull();
    gm.undoAction();
    expect(gm.state.showdown_result).toBeNull();
  });

  test('hole cards are hidden again (phase != showdown) after undo', () => {
    const gm = makeTable(2);
    startGame(gm);
    advanceTo(gm, 'river');
    if (gm.state.phase !== 'river') return;

    gm.forceNextStreet();
    gm.undoAction();
    // In river phase non-coach sees opponents as HIDDEN
    const state = gm.getPublicState('p1', false);
    const opp = state.players.find(p => p.id === 'p2');
    if (opp && opp.hole_cards.length > 0) {
      expect(opp.hole_cards).toContain('HIDDEN');
    }
  });
});

// ─── 1d. Dynamic Stack Reset ─────────────────────────────────────────────────

describe('1d — Dynamic Stack Reset: adjustStack validation', () => {
  test('valid positive amount is accepted', () => {
    const gm = makeTable(2);
    const p = gm._gamePlayers()[0];
    const r = gm.adjustStack(p.id, 500);
    expect(r.error).toBeUndefined();
    expect(gm.state.players.find(pl => pl.id === p.id).stack).toBe(500);
  });

  test('negative amount is blocked', () => {
    const gm = makeTable(2);
    const p = gm._gamePlayers()[0];
    expect(gm.adjustStack(p.id, -100).error).toBeTruthy();
  });

  test('Infinity is blocked', () => {
    const gm = makeTable(2);
    const p = gm._gamePlayers()[0];
    expect(gm.adjustStack(p.id, Infinity).error).toBeTruthy();
  });

  test('NaN is blocked', () => {
    const gm = makeTable(2);
    const p = gm._gamePlayers()[0];
    expect(gm.adjustStack(p.id, NaN).error).toBeTruthy();
  });

  test('decimal amount is floored to integer chips', () => {
    const gm = makeTable(2);
    const p = gm._gamePlayers()[0];
    gm.adjustStack(p.id, 333.9);
    expect(gm.state.players.find(pl => pl.id === p.id).stack).toBe(333);
  });

  // FIXED (was "KNOWN GAP"): adjustStack now rejects amounts below what the player
  // has already committed this street. Implemented in adjustStack() validation.
  test('stack below committed amount is rejected', () => {
    const gm = makeTable(2);
    startGame(gm);
    const [p1] = gm._gamePlayers();
    // Let the first player call the BB (they'll have committed chips)
    if (gm.state.current_turn === p1.id) {
      gm.placeBet(p1.id, 'call');
    }
    // p1 has committed chips this street — setting stack to 0 should be rejected
    // (their committed amount is already locked into the pot)
    const committed = gm.state.players.find(p => p.id === p1.id)?.total_bet_this_round || 0;
    if (committed > 0) {
      const r = gm.adjustStack(p1.id, 0);
      expect(r.error).toBeTruthy();
    }
  });
});

// ─── 2a. Reconnect Sync ───────────────────────────────────────────────────────

describe('2a — Reconnect Sync: state is correct after mid-hand rejoin', () => {
  test('public state shows correct board and pot after player re-added', () => {
    const gm = makeTable(3);
    startGame(gm);
    advanceTo(gm, 'flop');
    if (gm.state.phase !== 'flop') return;

    const boardLen = gm.state.board.length;
    const pot = gm.state.pot;
    gm.removePlayer('p2');
    gm.addPlayer('p2_new', 'Player2');

    const state = gm.getPublicState('p2_new', false);
    expect(state.board).toHaveLength(boardLen);
    expect(state.pot).toBe(pot);
    expect(state.phase).toBe('flop');
  });

  test('reconnected player on river sees 5 board cards', () => {
    const gm = makeTable(3);
    startGame(gm);
    advanceTo(gm, 'river');
    if (gm.state.phase !== 'river') return;

    gm.removePlayer('p2');
    gm.addPlayer('p2_reconnected', 'Player2');
    const state = gm.getPublicState('p2_reconnected', false);
    expect(state.board).toHaveLength(5);
  });

  test('remaining players can still act after a disconnect', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    const other = gm._gamePlayers().find(p => p.id !== currentId && p.is_active);
    gm.removePlayer(other.id);
    // Current player should not get "not your turn"
    const r = gm.placeBet(currentId, 'check');
    expect(r.error).not.toMatch(/not your turn/i);
  });

  test('getPublicState does not crash after mid-hand disconnect', () => {
    const gm = makeTable(3);
    startGame(gm);
    gm.removePlayer('p1');
    expect(() => gm.getPublicState('p2', false)).not.toThrow();
    expect(() => gm.getPublicState('coach', true)).not.toThrow();
  });
});

// ─── 2c. Simultaneous Actions ────────────────────────────────────────────────

describe('2c — Simultaneous Actions: backend processes sequentially', () => {
  test('out-of-turn action is rejected with "Not your turn"', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    const other = gm._gamePlayers().find(p => p.id !== currentId && p.is_active);
    expect(gm.placeBet(other.id, 'check').error).toMatch(/not your turn/i);
  });

  test('in-turn action succeeds while other requests fail', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    const others = gm._gamePlayers().filter(p => p.id !== currentId && p.is_active);

    others.forEach(p => {
      expect(gm.placeBet(p.id, 'fold').error).toBeTruthy();
    });

    // Use 'fold' as the in-turn action — always valid regardless of bet structure
    const r = gm.placeBet(currentId, 'fold');
    expect(r.error).toBeUndefined();
  });

  test('out-of-turn fold does not remove player from active set', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    const other = gm._gamePlayers().find(p => p.id !== currentId && p.is_active);
    const activeBefore = gm._gamePlayers().filter(p => p.is_active).length;
    gm.placeBet(other.id, 'fold');
    expect(gm._gamePlayers().filter(p => p.is_active).length).toBe(activeBefore);
  });

  test('state current_turn unchanged after out-of-turn attempts', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    const others = gm._gamePlayers().filter(p => p.id !== currentId);
    others.forEach(p => { gm.placeBet(p.id, 'raise', 100); });
    expect(gm.state.current_turn).toBe(currentId);
  });
});

// ─── 3a. Multi-Way Side Pots ─────────────────────────────────────────────────

describe('3a — Multi-Way Side Pots: three players all-in 100 / 500 / 1000', () => {
  function makePlayers() {
    return [
      { id: 'A', seat: 0, stack: 0, total_contributed: 100,  is_active: true, is_all_in: true,  action: 'all-in' },
      { id: 'B', seat: 1, stack: 0, total_contributed: 500,  is_active: true, is_all_in: true,  action: 'all-in' },
      { id: 'C', seat: 2, stack: 0, total_contributed: 1000, is_active: true, is_all_in: false, action: 'called' },
    ];
  }

  test('produces 3 pots with correct amounts', () => {
    const pots = buildSidePots(makePlayers());
    expect(pots).toHaveLength(3);
    expect(pots[0].amount).toBe(300);   // 100 × 3
    expect(pots[1].amount).toBe(800);   // 400 × 2
    expect(pots[2].amount).toBe(500);   // 500 × 1
  });

  test('total across all pots = 1600', () => {
    const pots = buildSidePots(makePlayers());
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(1600);
  });

  test('main pot (pots[0]) has all three players eligible', () => {
    const pots = buildSidePots(makePlayers());
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  });

  test('side pot 1 (pots[1]) excludes short-stack A', () => {
    const pots = buildSidePots(makePlayers());
    expect(pots[1].eligiblePlayerIds).toContain('B');
    expect(pots[1].eligiblePlayerIds).toContain('C');
    expect(pots[1].eligiblePlayerIds).not.toContain('A');
  });

  test('side pot 2 (pots[2]) only has C eligible', () => {
    const pots = buildSidePots(makePlayers());
    expect(pots[2].eligiblePlayerIds).toEqual(['C']);
  });

  test('chip conservation holds across showdown via GameManager', () => {
    const gm = makeTable(3);
    startGame(gm);
    const [p1, p2, p3] = gm._gamePlayers();
    const initialTotal = p1.stack + p2.stack + p3.stack + gm.state.pot;

    // Force p1 all-in
    gm.state.current_turn = p1.id;
    gm.placeBet(p1.id, 'raise', p1.stack + p1.total_bet_this_round);
    if (p2.is_active && !p2.is_all_in) {
      gm.state.current_turn = p2.id;
      gm.placeBet(p2.id, 'call');
    }
    if (p3.is_active && !p3.is_all_in) {
      gm.state.current_turn = p3.id;
      gm.placeBet(p3.id, 'call');
    }
    advanceTo(gm, 'showdown');

    const finalTotal = gm._gamePlayers().reduce((s, p) => s + p.stack, 0) + gm.state.pot;
    expect(finalTotal).toBe(initialTotal);
  });
});

// ─── 3b. Under-Raise All-In ───────────────────────────────────────────────────

describe('3b — Under-Raise All-In: re-raise blocking after incomplete all-in', () => {
  test('full raise sets last_raise_was_full = true', () => {
    const gm = makeTable(3);
    startGame(gm);
    const currentId = gm.state.current_turn;
    gm.placeBet(currentId, 'raise', 100);
    expect(gm.state.last_raise_was_full).toBe(true);
  });

  test('full raise reopens action for all active players', () => {
    const gm = makeTable(3);
    startGame(gm);
    const [p1, p2, p3] = gm._gamePlayers();
    gm.state.current_turn = p1.id;
    gm.placeBet(p1.id, 'raise', 100);
    // Players who haven't acted should be 'waiting'
    const p2s = gm._gamePlayers().find(p => p.id === p2.id);
    const p3s = gm._gamePlayers().find(p => p.id === p3.id);
    expect(p2s.action).toBe('waiting');
    expect(p3s.action).toBe('waiting');
  });

  test('incomplete all-in sets last_raise_was_full = false', () => {
    // Use 3 players so that after p2's incomplete all-in, p3 is still waiting
    // and the betting round does NOT immediately end (which would trigger
    // _advanceStreet and reset last_raise_was_full to true for the new street).
    const gm = makeTable(3);
    startGame(gm);
    const [p1, p2, p3] = gm._gamePlayers();

    // p1 raises to 60 (full raise — reopens action for p2 and p3)
    gm.state.current_turn = p1.id;
    gm.placeBet(p1.id, 'raise', 60);

    // Give p2 a tiny stack so their all-in is below min_raise increment
    const p2player = gm._gamePlayers().find(p => p.id === p2.id);
    p2player.stack = 5;
    const allInAmt = p2player.total_bet_this_round + p2player.stack;
    const raiseIncrement = allInAmt - gm.state.current_bet;
    if (raiseIncrement < gm.state.min_raise) {
      // p3 still has action = 'waiting', so the round won't end after p2's all-in
      gm.state.current_turn = p2.id;
      gm.placeBet(p2.id, 'raise', allInAmt);
      // last_raise_was_full should be false because p2's all-in was incomplete
      expect(gm.state.last_raise_was_full).toBe(false);
    }
  });

  test('player who already acted cannot re-raise after incomplete all-in', () => {
    const gm = makeTable(2);
    startGame(gm);
    const [p1, p2] = gm._gamePlayers();

    gm.state.current_turn = p1.id;
    gm.placeBet(p1.id, 'raise', 60);

    const p2player = gm._gamePlayers().find(p => p.id === p2.id);
    p2player.stack = 5;
    const allInAmt = p2player.total_bet_this_round + p2player.stack;
    const raiseIncrement = allInAmt - gm.state.current_bet;

    if (raiseIncrement < gm.state.min_raise) {
      gm.state.current_turn = p2.id;
      gm.placeBet(p2.id, 'raise', allInAmt);

      if (!gm.state.last_raise_was_full) {
        // p1 already acted — should be blocked from re-raising
        const p1player = gm._gamePlayers().find(p => p.id === p1.id);
        p1player.acted_this_street = true;
        gm.state.current_turn = p1.id;
        const r = gm.placeBet(p1.id, 'raise', gm.state.current_bet + gm.state.min_raise);
        expect(r.error).toBeTruthy();
        expect(r.error).toMatch(/incomplete all-in/i);
      }
    }
  });

  test('player who already acted can still call after incomplete all-in', () => {
    const gm = makeTable(2);
    startGame(gm);
    const [p1, p2] = gm._gamePlayers();

    gm.state.current_turn = p1.id;
    gm.placeBet(p1.id, 'raise', 60);

    const p2player = gm._gamePlayers().find(p => p.id === p2.id);
    p2player.stack = 5;
    const allInAmt = p2player.total_bet_this_round + p2player.stack;
    const raiseIncrement = allInAmt - gm.state.current_bet;

    if (raiseIncrement < gm.state.min_raise) {
      gm.state.current_turn = p2.id;
      gm.placeBet(p2.id, 'raise', allInAmt);

      if (!gm.state.last_raise_was_full) {
        gm.state.current_turn = p1.id;
        const r = gm.placeBet(p1.id, 'call');
        // Call should succeed (not re-raise)
        expect(r.error).toBeUndefined();
      }
    }
  });
});

// ─── 3c. Odd-Chip Distribution ───────────────────────────────────────────────

describe('3c — Odd-Chip Distribution: closest to SB clockwise', () => {
  test('_sortWinnersBySBProximity puts SB first when SB is a winner', () => {
    const gm = new GameManager('qa-odd');
    gm.addPlayer('pA', 'Alice');
    gm.addPlayer('pB', 'Bob');
    gm.startGame('rng');

    const sbPlayer  = gm._gamePlayers().find(p => p.is_small_blind);
    const nonSb     = gm._gamePlayers().find(p => !p.is_small_blind);
    expect(sbPlayer).toBeDefined();

    const sorted = gm._sortWinnersBySBProximity([
      { player: nonSb,   handResult: {} },
      { player: sbPlayer, handResult: {} }
    ]);
    expect(sorted[0].player.id).toBe(sbPlayer.id);
  });

  test('_sortWinnersBySBProximity orders correctly when SB is not a winner', () => {
    const gm = new GameManager('qa-odd2');
    gm.addPlayer('pA', 'Alice');
    gm.addPlayer('pB', 'Bob');
    gm.addPlayer('pC', 'Carol');
    gm.startGame('rng');

    const players = gm._gamePlayers();
    const sbSeat = players.find(p => p.is_small_blind).seat;
    // Take the two non-SB players as "winners"
    const nonSbWinners = players
      .filter(p => !p.is_small_blind)
      .map(p => ({ player: p, handResult: {} }));

    if (nonSbWinners.length >= 2) {
      const sorted = gm._sortWinnersBySBProximity(nonSbWinners);
      // First should be the one closest clockwise from SB
      const numSeats = Math.max(...players.map(p => p.seat)) + 1;
      const distFirst  = (sorted[0].player.seat - sbSeat + numSeats) % numSeats;
      const distSecond = (sorted[1].player.seat - sbSeat + numSeats) % numSeats;
      expect(distFirst).toBeLessThan(distSecond);
    }
  });

  test('chip conservation always holds (no chips created or destroyed)', () => {
    for (let i = 0; i < 10; i++) {
      const gm = makeTable(2);
      const total = gm._gamePlayers().reduce((s, p) => s + p.stack, 0);
      startGame(gm);
      advanceTo(gm, 'showdown');
      const after = gm._gamePlayers().reduce((s, p) => s + p.stack, 0) + gm.state.pot;
      expect(after).toBe(total);
    }
  });
});
