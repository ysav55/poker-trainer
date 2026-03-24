'use strict';

/**
 * Phase 6 — New Data Collection Tests
 *
 * Tests _computePositions (position labelling) and the Phase 6 call-site
 * changes in index.js (stack_at_action, pot_at_action, decision_time_ms,
 * session_type) via mocked Supabase.
 */

// ── Mock Supabase so HandLoggerSupabase can be required without a real connection ──
const insertedActions = [];
const upsertedHandPlayers = [];
const upsertedHands = [];

jest.mock('../supabase', () => {
  function makeChain(store) {
    const chain = {
      _filters: {},
      select() { return this; },
      insert(data) { store.push(data); return Promise.resolve({ data, error: null }); },
      upsert(data) { store.push(data); return Promise.resolve({ data, error: null }); },
      update() { return this; },
      delete() { return this; },
      eq() { return this; },
      in() { return this; },
      order() { return this; },
      limit() { return this; },
      range() { return this; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
    };
    return chain;
  }

  return {
    from(table) {
      if (table === 'hand_actions')  return makeChain(insertedActions);
      if (table === 'hand_players')  return makeChain(upsertedHandPlayers);
      if (table === 'hands')         return makeChain(upsertedHands);
      return makeChain([]);
    },
  };
});

const { _computePositions } = require('../HandLoggerSupabase');

// ─── _computePositions ────────────────────────────────────────────────────────

describe('_computePositions', () => {

  // Helper: build a simple player array from a seat list
  function makePlayers(seats) {
    return seats.map((seat, i) => ({ id: `p${i + 1}`, seat }));
  }

  // ── 2 players (heads-up) ─────────────────────────────────────────────────
  describe('2 players (heads-up)', () => {
    // HU rules: BTN = dealer = SB (acts first preflop, last postflop)
    // Seats: 0=dealer, 1=BB
    test('dealer at seat 0 → p1=BTN, p2=SB', () => {
      const players = makePlayers([0, 1]);
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('p2')).toBe('SB');
    });

    test('dealer at seat 1 → p2=BTN, p1=SB', () => {
      const players = makePlayers([0, 1]);
      const map = _computePositions(players, 1);
      expect(map.get('p2')).toBe('BTN');
      expect(map.get('p1')).toBe('SB');
    });
  });

  // ── 3 players ────────────────────────────────────────────────────────────
  describe('3 players', () => {
    // seats 0,1,2 — dealer=0 → BTN=0, SB=1, BB=2
    test('dealer seat 0 → correct BTN/SB/BB', () => {
      const players = makePlayers([0, 1, 2]);
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('p2')).toBe('SB');
      expect(map.get('p3')).toBe('BB');
    });

    test('dealer seat 2 → BTN=p3, SB=p1, BB=p2', () => {
      const players = makePlayers([0, 1, 2]);
      const map = _computePositions(players, 2);
      expect(map.get('p3')).toBe('BTN');
      expect(map.get('p1')).toBe('SB');
      expect(map.get('p2')).toBe('BB');
    });

    test('dealer seat 1 → BTN=p2, SB=p3, BB=p1', () => {
      const players = makePlayers([0, 1, 2]);
      const map = _computePositions(players, 1);
      expect(map.get('p2')).toBe('BTN');
      expect(map.get('p3')).toBe('SB');
      expect(map.get('p1')).toBe('BB');
    });
  });

  // ── 4 players ────────────────────────────────────────────────────────────
  describe('4 players', () => {
    // dealer=0 → BTN=p1(s0), SB=p2(s1), BB=p3(s2), UTG=p4(s3)
    test('dealer seat 0 → all four positions assigned', () => {
      const players = makePlayers([0, 1, 2, 3]);
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('p2')).toBe('SB');
      expect(map.get('p3')).toBe('BB');
      expect(map.get('p4')).toBe('UTG');
    });
  });

  // ── 6 players ────────────────────────────────────────────────────────────
  describe('6 players', () => {
    // dealer=0 → BTN SB BB UTG UTG+1 HJ
    test('dealer seat 0 → full 6-handed position set', () => {
      const players = makePlayers([0, 1, 2, 3, 4, 5]);
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('p2')).toBe('SB');
      expect(map.get('p3')).toBe('BB');
      expect(map.get('p4')).toBe('UTG');
      expect(map.get('p5')).toBe('UTG+1');
      expect(map.get('p6')).toBe('HJ');
    });
  });

  // ── Coach occupies a seat in the rotation ────────────────────────────────
  describe('coach in rotation', () => {
    test('coach at BTN seat shifts students to SB/BB', () => {
      // 3 players: coach at seat 0 (BTN), student1 at seat 1 (SB), student2 at seat 2 (BB)
      const players = [
        { id: 'coach', seat: 0, is_coach: true },
        { id: 'p1',    seat: 1 },
        { id: 'p2',    seat: 2 },
      ];
      const map = _computePositions(players, 0);
      expect(map.get('coach')).toBe('BTN');
      expect(map.get('p1')).toBe('SB');
      expect(map.get('p2')).toBe('BB');
    });

    test('coach at SB seat — students get BTN and BB', () => {
      // seats 0,1,2; dealer at seat 2 → BTN=p3(s2), SB=coach(s0), BB=p1(s1)
      const players = [
        { id: 'p1',    seat: 1 },
        { id: 'coach', seat: 0, is_coach: true },
        { id: 'p2',    seat: 2 },
      ];
      const map = _computePositions(players, 2);
      expect(map.get('p2')).toBe('BTN');
      expect(map.get('coach')).toBe('SB');
      expect(map.get('p1')).toBe('BB');
    });

    test('4-way with coach: positions account for coach seat', () => {
      // seats 0,1,2,3; coach at seat 1; dealer at seat 0
      // sorted: s0=BTN, s1=SB(coach), s2=BB, s3=UTG
      const players = [
        { id: 'p1',    seat: 0 },
        { id: 'coach', seat: 1, is_coach: true },
        { id: 'p2',    seat: 2 },
        { id: 'p3',    seat: 3 },
      ];
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('coach')).toBe('SB');
      expect(map.get('p2')).toBe('BB');
      expect(map.get('p3')).toBe('UTG');
    });

    test('without allPlayers (coach absent): student gets wrong position', () => {
      // Demonstrates why allPlayers is needed. Scenario: seats 0,1,2; dealer=seat 0 (a student);
      // coach sits at seat 1 (between dealer and BB). Coach should be SB, p2 should be BB.
      const playersWithCoach = [
        { id: 'p1',    seat: 0 },  // dealer → BTN
        { id: 'coach', seat: 1 },  // SB
        { id: 'p2',    seat: 2 },  // BB
      ];
      const playersWithoutCoach = [
        { id: 'p1', seat: 0 },  // dealer → BTN
        { id: 'p2', seat: 2 },  // skips seat 1 — coach's gap ignored
      ];
      const withCoach    = _computePositions(playersWithCoach,    0);
      const withoutCoach = _computePositions(playersWithoutCoach, 0);

      // With coach: p2 correctly gets BB (coach is between them as SB)
      expect(withCoach.get('p1')).toBe('BTN');
      expect(withCoach.get('coach')).toBe('SB');
      expect(withCoach.get('p2')).toBe('BB');

      // Without coach: p2 incorrectly gets SB (coach's seat gap is invisible)
      expect(withoutCoach.get('p1')).toBe('BTN');
      expect(withoutCoach.get('p2')).toBe('SB'); // wrong — should be BB
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    test('returns empty Map for 1 player', () => {
      const map = _computePositions([{ id: 'p1', seat: 0 }], 0);
      expect(map.size).toBe(0);
    });

    test('returns empty Map for no players', () => {
      const map = _computePositions([], 0);
      expect(map.size).toBe(0);
    });

    test('returns empty Map when dealer seat not found', () => {
      const players = makePlayers([0, 1, 2]);
      const map = _computePositions(players, 9); // seat 9 doesn't exist
      expect(map.size).toBe(0);
    });

    test('players with negative seats are excluded', () => {
      // Coach with seat=-1 (observer mode, shouldn't happen but guard test)
      const players = [
        { id: 'p1', seat: -1 },
        { id: 'p2', seat: 0 },
        { id: 'p3', seat: 1 },
      ];
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBeUndefined(); // seat=-1 excluded
      expect(map.get('p2')).toBe('BTN');
      expect(map.get('p3')).toBe('SB');
    });

    test('non-consecutive seat numbers — rotates correctly', () => {
      // Real game: seats 2, 5, 7 (sparse IDs from disconnections)
      const players = [
        { id: 'pA', seat: 2 },
        { id: 'pB', seat: 5 },
        { id: 'pC', seat: 7 },
      ];
      // dealer=seat 5 → sorted [s2,s5,s7]; dealerIdx=1 → BTN=pB(s5), SB=pC(s7), BB=pA(s2)
      const map = _computePositions(players, 5);
      expect(map.get('pB')).toBe('BTN');
      expect(map.get('pC')).toBe('SB');
      expect(map.get('pA')).toBe('BB');
    });

    test('7 players uses CO label', () => {
      const players = makePlayers([0, 1, 2, 3, 4, 5, 6]);
      const map = _computePositions(players, 0);
      expect(map.get('p1')).toBe('BTN');
      expect(map.get('p7')).toBe('CO'); // last label before BTN
    });
  });
});
