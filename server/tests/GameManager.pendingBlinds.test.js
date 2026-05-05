'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');
const SharedState = require('../state/SharedState.js');
const GameManager = require('../game/GameManager.js');

// Helper: build a minimal GameManager fixture with players
function buildGame(tableId = 't1', sb = 10, bb = 20) {
  const gm = new GameManager(tableId);
  gm.addPlayer('p1', 'Player 1');
  gm.addPlayer('p2', 'Player 2');
  // Verify we can read/write blind levels
  gm.state.small_blind = sb;
  gm.state.big_blind = bb;
  return gm;
}

beforeEach(() => {
  SharedState.pendingBlinds.clear();
  SharedState.tableSharedRanges.clear();
});

describe('GameManager — apply pending blinds on resetForNextHand', () => {
  it('applies queued delta on resetForNextHand and clears pending', () => {
    const gm = buildGame('t1', 10, 20);
    // Start a hand so phase is not 'waiting'
    gm.startGame('rng');
    // Queue a blind delta
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: Date.now() });

    // Reset hand — should consume pending blinds
    gm.resetForNextHand();

    expect(gm.state.small_blind).toBe(25);
    expect(gm.state.big_blind).toBe(50);
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('does not change blinds when no pending entry', () => {
    const gm = buildGame('t1', 10, 20);
    gm.startGame('rng');

    gm.resetForNextHand();

    expect(gm.state.small_blind).toBe(10);
    expect(gm.state.big_blind).toBe(20);
  });

  it('discards pending if older than 1 hour (stale guard)', () => {
    const gm = buildGame('t1', 10, 20);
    gm.startGame('rng');
    // Queue a stale entry (1 hour + 1 ms old)
    SharedState.pendingBlinds.set('t1', {
      sb: 25,
      bb: 50,
      queuedBy: 'coach-a',
      queuedAt: Date.now() - 60 * 60 * 1000 - 1
    });

    gm.resetForNextHand();

    expect(gm.state.small_blind).toBe(10); // unchanged — pending was stale
    expect(SharedState.pendingBlinds.has('t1')).toBe(false); // cleared even though stale
  });

  it('applies pending blinds at exactly 1 hour boundary (inclusive)', () => {
    const gm = buildGame('t1', 10, 20);
    gm.startGame('rng');
    // Queue at exactly 1 hour old. Use a buffer to account for test execution time drift.
    const oneHourAgo = Date.now() - 60 * 60 * 1000 + 100; // 100ms buffer
    SharedState.pendingBlinds.set('t1', {
      sb: 25,
      bb: 50,
      queuedBy: 'coach-a',
      queuedAt: oneHourAgo
    });

    gm.resetForNextHand();

    // Verify it was applied (age <= TTL boundary is inclusive)
    expect(gm.state.small_blind).toBe(25);
    expect(gm.state.big_blind).toBe(50);
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('does not apply pending blinds for a different table', () => {
    const gm = buildGame('t1', 10, 20);
    gm.startGame('rng');
    // Queue for a different table
    SharedState.pendingBlinds.set('t2', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: Date.now() });

    gm.resetForNextHand();

    expect(gm.state.small_blind).toBe(10); // t1 unchanged
    expect(SharedState.pendingBlinds.has('t2')).toBe(true); // t2 entry still there (not for this table)
  });
});

describe('GameManager.getPublicState — pending_blinds', () => {
  it('includes pending_blinds when queued', () => {
    const gm = buildGame('t1', 10, 20);
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const state = gm.getPublicState('p1', false);
    expect(state.pending_blinds).toMatchObject({ sb: 25, bb: 50, queuedAt: 100 });
    // queuedBy is internal; should NOT leak to public state
    expect(state.pending_blinds).not.toHaveProperty('queuedBy');
  });

  it('pending_blinds is null when nothing queued', () => {
    const gm = buildGame('t1', 10, 20);
    const state = gm.getPublicState('p1', false);
    expect(state.pending_blinds).toBeNull();
  });
});

describe('GameManager — clears shared range on resetForNextHand', () => {
  it('removes tableSharedRanges entry on reset', () => {
    const gm = buildGame('t1', 10, 20);
    SharedState.tableSharedRanges.set('t1', { groups: ['AKo'], label: 'x', broadcastedAt: Date.now() });
    gm.startGame('rng');
    gm.resetForNextHand();
    expect(SharedState.tableSharedRanges.has('t1')).toBe(false);
  });

  it('does not error if no shared range was set', () => {
    const gm = buildGame('t1', 10, 20);
    gm.startGame('rng');
    expect(() => {
      gm.resetForNextHand();
    }).not.toThrow();
  });
});
