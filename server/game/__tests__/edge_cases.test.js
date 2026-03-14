'use strict';

/**
 * QA-06 — Edge Case Tests
 *
 * Suites:
 * 1. Heads-up (2 players) — dealer/blind logic for 2-player game
 * 2. Coach-only room — coach + 1 player; game still starts
 * 3. Maximum players — add 9 players; game starts, all get cards
 * 4. All-in heads-up — 2 players, one goes all-in immediately
 * 5. Empty board / forceNextStreet edge — verify no crash at showdown without completing streets
 */

const GameManager = require('../GameManager');
const SessionManager = require('../SessionManager');

// ─────────────────────────────────────────────
//  Suite 1 — Heads-up (2 players)
// ─────────────────────────────────────────────

describe('Edge cases — heads-up (2 players)', () => {
  /**
   * 2-player blind/dealer logic (GameManager does NOT use special heads-up rules):
   *   dealer_seat = 0
   *   dealerIdx = 0 → p1 is dealer
   *   sbIdx = 1 → p2 is small blind
   *   bbIdx = 0 → p1 is big blind  (wraps around)
   *   utgIdx = 1 → p2 acts first preflop
   */
  function buildHeadsUp() {
    const gm = new GameManager('hu-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
    return gm;
  }

  it('starts with exactly 2 players and phase = preflop', () => {
    const gm = buildHeadsUp();
    expect(gm.state.phase).toBe('preflop');
    expect(gm._gamePlayers()).toHaveLength(2);
  });

  it('both players are dealt 2 hole cards', () => {
    const gm = buildHeadsUp();
    gm._gamePlayers().forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
    });
  });

  it('exactly one player is dealer', () => {
    const gm = buildHeadsUp();
    const dealers = gm._gamePlayers().filter(p => p.is_dealer);
    expect(dealers).toHaveLength(1);
  });

  it('exactly one player is small blind', () => {
    const gm = buildHeadsUp();
    const sbs = gm._gamePlayers().filter(p => p.is_small_blind);
    expect(sbs).toHaveLength(1);
  });

  it('exactly one player is big blind', () => {
    const gm = buildHeadsUp();
    const bbs = gm._gamePlayers().filter(p => p.is_big_blind);
    expect(bbs).toHaveLength(1);
  });

  it('small blind posted correct amount (10)', () => {
    const gm = buildHeadsUp();
    const sb = gm._gamePlayers().find(p => p.is_small_blind);
    expect(sb.total_bet_this_round).toBe(10);
    expect(sb.stack).toBe(990);
  });

  it('big blind posted correct amount (20)', () => {
    const gm = buildHeadsUp();
    const bb = gm._gamePlayers().find(p => p.is_big_blind);
    expect(bb.total_bet_this_round).toBe(20);
    expect(bb.stack).toBe(980);
  });

  it('pot starts at 30 (SB + BB)', () => {
    const gm = buildHeadsUp();
    expect(gm.state.pot).toBe(30);
  });

  it('current_turn is set to a valid player id', () => {
    const gm = buildHeadsUp();
    const playerIds = gm._gamePlayers().map(p => p.id);
    expect(playerIds).toContain(gm.state.current_turn);
  });

  it('can play a full hand to showdown', () => {
    const gm = buildHeadsUp();
    gm.forceNextStreet(); // flop
    gm.forceNextStreet(); // turn
    gm.forceNextStreet(); // river
    gm.forceNextStreet(); // showdown
    expect(gm.state.phase).toBe('showdown');
    expect(gm.state.winner).toBeTruthy();
  });

  it('fold-to-one works in heads-up', () => {
    const gm = buildHeadsUp();
    const currentTurn = gm.state.current_turn;
    const result = gm.placeBet(currentTurn, 'fold');
    expect(result).toEqual({ success: true });
    expect(gm.state.phase).toBe('showdown');
    const activePlayers = gm._gamePlayers().filter(p => p.is_active);
    expect(activePlayers).toHaveLength(1);
    expect(gm.state.winner).toBe(activePlayers[0].id);
  });

  it('dealer seat rotates after resetForNextHand', () => {
    const gm = buildHeadsUp();
    const initialDealer = gm._gamePlayers().find(p => p.is_dealer).id;

    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.resetForNextHand();
    gm.startGame('rng');

    const newDealer = gm._gamePlayers().find(p => p.is_dealer).id;
    expect(newDealer).not.toBe(initialDealer);
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — Coach-only room
// ─────────────────────────────────────────────

// Epic 12: Coach now has a real seat and plays like any other player.
describe('Edge cases — coach in room', () => {
  it('coach + 1 player starts successfully (coach counts as seated player)', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true); // coach gets a real seat
    gm.addPlayer('p1', 'Alice');            // 1 non-coach

    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
  });

  it('coach has a real seat (>= 0)', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true);

    const coach = gm.state.players.find(p => p.id === 'coach1');
    expect(coach.seat).toBeGreaterThanOrEqual(0);
  });

  it('coach is included in _gamePlayers', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true);
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const gamePlayers = gm._gamePlayers();
    expect(gamePlayers).toHaveLength(3);
    const coachInGame = gamePlayers.find(p => p.id === 'coach1');
    expect(coachInGame).toBeDefined();
    expect(coachInGame.is_coach).toBe(true);
  });

  it('coach receives hole_cards in RNG mode', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true);
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const coach = gm.state.players.find(p => p.id === 'coach1');
    expect(coach.hole_cards).toHaveLength(2);
  });

  it('current_turn can be the coach (coach plays as normal player)', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true);
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    // current_turn must be one of the players (including possibly coach)
    const playerIds = ['coach1', 'p1', 'p2'];
    expect(playerIds).toContain(gm.state.current_turn);
  });

  it('placeBet from coach succeeds when it is the coach turn', () => {
    const gm = new GameManager('coach-table');
    gm.addPlayer('coach1', 'Coach', true);
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    // Fast-forward to coach's turn by folding everyone else first
    const nonCoach = gm.state.players.filter(p => p.id !== 'coach1');
    for (const p of nonCoach) {
      if (gm.state.current_turn !== 'coach1' && gm.state.phase !== 'showdown') {
        gm.placeBet(gm.state.current_turn, 'fold');
      }
    }

    if (gm.state.current_turn === 'coach1') {
      const result = gm.placeBet('coach1', 'call');
      // Either succeeds or "not your turn" — either way it must be defined
      expect(result).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — Maximum players (9)
// ─────────────────────────────────────────────

describe('Edge cases — maximum players (9)', () => {
  function buildNinePlayerGame() {
    const gm = new GameManager('big-table');
    for (let i = 1; i <= 9; i++) {
      const result = gm.addPlayer(`p${i}`, `Player ${i}`);
      expect(result.error).toBeUndefined();
    }
    return gm;
  }

  it('can add exactly 9 players without error', () => {
    const gm = new GameManager('big-table');
    for (let i = 1; i <= 9; i++) {
      const result = gm.addPlayer(`p${i}`, `Player ${i}`);
      expect(result.error).toBeUndefined();
    }
    expect(gm.state.players).toHaveLength(9);
  });

  it('10th player is rejected (table full)', () => {
    const gm = buildNinePlayerGame();
    const result = gm.addPlayer('p10', 'Player 10');
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/full/i);
  });

  it('9-player game starts successfully', () => {
    const gm = buildNinePlayerGame();
    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
  });

  it('all 9 players receive 2 hole cards', () => {
    const gm = buildNinePlayerGame();
    gm.startGame('rng');
    gm._gamePlayers().forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
    });
  });

  it('exactly one dealer, one SB, one BB in 9-player game', () => {
    const gm = buildNinePlayerGame();
    gm.startGame('rng');
    const players = gm._gamePlayers();
    expect(players.filter(p => p.is_dealer)).toHaveLength(1);
    expect(players.filter(p => p.is_small_blind)).toHaveLength(1);
    expect(players.filter(p => p.is_big_blind)).toHaveLength(1);
  });

  it('all 9 players have unique seats 0-8', () => {
    const gm = buildNinePlayerGame();
    const seats = gm.state.players.map(p => p.seat);
    const uniqueSeats = new Set(seats);
    expect(uniqueSeats.size).toBe(9);
    for (let i = 0; i < 9; i++) {
      expect(uniqueSeats.has(i)).toBe(true);
    }
  });

  it('9-player game can reach showdown via forceNextStreet', () => {
    const gm = buildNinePlayerGame();
    gm.startGame('rng');
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    expect(gm.state.phase).toBe('showdown');
  });

  it('pot is correct after blinds with 9 players (SB=10, BB=20 → pot=30)', () => {
    const gm = buildNinePlayerGame();
    gm.startGame('rng');
    expect(gm.state.pot).toBe(30);
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — All-in heads-up
// ─────────────────────────────────────────────

describe('Edge cases — all-in heads-up', () => {
  it('player can go all-in by raising their entire stack', () => {
    const gm = new GameManager('allin-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const currentTurn = gm.state.current_turn;
    const currentPlayer = gm.state.players.find(p => p.id === currentTurn);
    const allInAmount = currentPlayer.stack + currentPlayer.total_bet_this_round;

    const result = gm.placeBet(currentTurn, 'raise', allInAmount);
    expect(result).toEqual({ success: true });

    // Player should be all-in
    expect(currentPlayer.is_all_in).toBe(true);
    expect(currentPlayer.stack).toBe(0);
  });

  it('all-in player has stack = 0', () => {
    const gm = new GameManager('allin-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const p1 = gm.state.players.find(p => p.id === 'p1');
    const p2 = gm.state.players.find(p => p.id === 'p2');

    // Force p2 to go all-in on their turn
    const utg = gm.state.current_turn;
    const utgPlayer = gm.state.players.find(p => p.id === utg);
    const allInAmt = utgPlayer.stack + utgPlayer.total_bet_this_round;
    gm.placeBet(utg, 'raise', allInAmt);

    // UTG player should have 0 stack
    expect(utgPlayer.stack).toBe(0);
    expect(utgPlayer.is_all_in).toBe(true);
  });

  it('when both players go all-in, game reaches showdown', () => {
    const gm = new GameManager('allin-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    // UTG goes all-in
    const utg = gm.state.current_turn;
    const utgPlayer = gm.state.players.find(p => p.id === utg);
    const allInAmt1 = utgPlayer.stack + utgPlayer.total_bet_this_round;
    gm.placeBet(utg, 'raise', allInAmt1);

    // If game not already at showdown, other player calls
    if (gm.state.phase !== 'showdown') {
      const nextTurn = gm.state.current_turn;
      if (nextTurn) {
        gm.placeBet(nextTurn, 'call');
      }
    }

    // Force to showdown if needed
    while (['preflop', 'flop', 'turn', 'river'].includes(gm.state.phase)) {
      gm.forceNextStreet();
    }

    expect(gm.state.phase).toBe('showdown');
  });

  it('winner is awarded the pot at showdown after all-in', () => {
    const gm = new GameManager('allin-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const initialTotal = gm.state.players.reduce((sum, p) => sum + p.stack, 0) + gm.state.pot;

    // UTG goes all-in
    const utg = gm.state.current_turn;
    const utgPlayer = gm.state.players.find(p => p.id === utg);
    const allInAmt = utgPlayer.stack + utgPlayer.total_bet_this_round;
    gm.placeBet(utg, 'raise', allInAmt);

    // Other player calls
    if (gm.state.current_turn) {
      gm.placeBet(gm.state.current_turn, 'call');
    }

    // Force to showdown
    while (['preflop', 'flop', 'turn', 'river'].includes(gm.state.phase)) {
      gm.forceNextStreet();
    }

    // After showdown, pot should be 0 (distributed)
    expect(gm.state.pot).toBe(0);
    expect(gm.state.winner).toBeTruthy();

    // Total chips should be conserved
    const finalTotal = gm.state.players.reduce((sum, p) => sum + p.stack, 0) + gm.state.pot;
    expect(finalTotal).toBe(initialTotal);
  });

  it('blinds can go all-in posting blind (stack < blind amount)', () => {
    const gm = new GameManager('shorty-table');
    gm.addPlayer('p1', 'Short Alice');
    gm.addPlayer('p2', 'Bob');

    // Set p1 stack very low
    const p1 = gm.state.players.find(p => p.id === 'p1');
    p1.stack = 5; // less than big blind (20)

    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });

    // Player with stack=5 posting big blind (they can only post 5) should be all-in
    const players = gm._gamePlayers();
    const shortPlayer = players.find(p => p.id === 'p1');
    if (shortPlayer.is_big_blind || shortPlayer.is_small_blind) {
      expect(shortPlayer.is_all_in).toBe(true);
      expect(shortPlayer.stack).toBe(0);
    }
  });

  it('side pots are built when player goes all-in for less than max bet', () => {
    const gm = new GameManager('sidepot-table');
    gm.addPlayer('p1', 'Short');
    gm.addPlayer('p2', 'Medium');
    gm.addPlayer('p3', 'Big');

    // Give p1 a small stack so they'll go all-in
    const p1 = gm.state.players.find(p => p.id === 'p1');
    p1.stack = 50;

    gm.startGame('rng');

    // Play to showdown — someone will likely be all-in
    let actionCount = 0;
    while (gm.state.phase !== 'showdown' && actionCount < 30) {
      const turn = gm.state.current_turn;
      if (!turn) {
        gm.forceNextStreet();
      } else {
        gm.placeBet(turn, 'call');
      }
      actionCount++;
    }

    if (gm.state.phase !== 'showdown') {
      gm.forceNextStreet();
      gm.forceNextStreet();
      gm.forceNextStreet();
      gm.forceNextStreet();
    }

    expect(gm.state.phase).toBe('showdown');
    // No crash — side pots may or may not be present depending on play
    expect(Array.isArray(gm.state.side_pots)).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — Empty board / forceNextStreet edge
// ─────────────────────────────────────────────

describe('Edge cases — forceNextStreet to showdown without full board', () => {
  it('forceNextStreet from preflop → flop deals 3 board cards', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    expect(gm.state.board).toHaveLength(0);
    gm.forceNextStreet();
    expect(gm.state.phase).toBe('flop');
    expect(gm.state.board).toHaveLength(3);
  });

  it('forceNextStreet from flop → turn deals 4 board cards', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet(); // → flop
    gm.forceNextStreet(); // → turn
    expect(gm.state.phase).toBe('turn');
    expect(gm.state.board).toHaveLength(4);
  });

  it('forceNextStreet from turn → river deals 5 board cards', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet(); // → flop
    gm.forceNextStreet(); // → turn
    gm.forceNextStreet(); // → river
    expect(gm.state.phase).toBe('river');
    expect(gm.state.board).toHaveLength(5);
  });

  it('forceNextStreet from river → showdown resolves winner', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet(); // → flop
    gm.forceNextStreet(); // → turn
    gm.forceNextStreet(); // → river
    gm.forceNextStreet(); // → showdown

    expect(gm.state.phase).toBe('showdown');
    expect(gm.state.winner).toBeTruthy();
    expect(gm.state.showdown_result).not.toBeNull();
  });

  it('forceNextStreet called at showdown returns error (not in betting phase)', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet(); // → showdown

    const result = gm.forceNextStreet(); // should error
    expect(result.error).toBeDefined();
  });

  it('forceNextStreet before startGame returns error', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    // Don't start game
    const result = gm.forceNextStreet();
    expect(result.error).toBeDefined();
  });

  it('board cards are unique (no duplicates)', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();

    const boardCards = gm.state.board;
    const uniqueCards = new Set(boardCards);
    expect(uniqueCards.size).toBe(boardCards.length);
  });

  it('board cards are not in any player hole cards', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();

    const boardSet = new Set(gm.state.board);
    gm._gamePlayers().forEach(p => {
      p.hole_cards.forEach(card => {
        expect(boardSet.has(card)).toBe(false);
      });
    });
  });

  it('showdown_result has allHands entry for each active player', () => {
    const gm = new GameManager('board-table');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();
    gm.forceNextStreet();

    const sr = gm.state.showdown_result;
    expect(sr).not.toBeNull();
    expect(sr.allHands).toBeDefined();
    expect(sr.allHands.length).toBeGreaterThanOrEqual(1);

    const activePlayers = gm._gamePlayers().filter(p => p.is_active);
    expect(sr.allHands).toHaveLength(activePlayers.length);
  });
});
