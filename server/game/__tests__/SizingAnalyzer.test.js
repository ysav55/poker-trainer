'use strict';

const { SizingAnalyzer } = require('../tagAnalyzers/sizing');

function makeAction(overrides) {
  return {
    id: 1,
    player_id: 'p1',
    action: 'bet',
    amount: 50,
    street: 'flop',
    is_reverted: false,
    pot_at_action: 100,
    sizingRatio: 0.5,
    position: null,
    ...overrides,
  };
}

function analyze(actions) {
  return SizingAnalyzer.analyze({ actions });
}

describe('SizingAnalyzer', () => {

  // ── Bucket boundaries ─────────────────────────────────────────────────────

  it('tags PROBE_BET for sizingRatio < 0.25 (boundary 0.24)', () => {
    const tags = analyze([makeAction({ id: 1, sizingRatio: 0.24 })]);
    expect(tags.map(t => t.tag)).toContain('PROBE_BET');
    expect(tags[0].player_id).toBe('p1');
    expect(tags[0].action_id).toBe(1);
  });

  it('tags THIRD_POT_BET for sizingRatio = 0.25 (lower boundary)', () => {
    const tags = analyze([makeAction({ id: 2, sizingRatio: 0.25 })]);
    expect(tags.map(t => t.tag)).toContain('THIRD_POT_BET');
  });

  it('tags THIRD_POT_BET for sizingRatio = 0.49 (upper boundary)', () => {
    const tags = analyze([makeAction({ id: 3, sizingRatio: 0.49 })]);
    expect(tags.map(t => t.tag)).toContain('THIRD_POT_BET');
  });

  it('tags HALF_POT_BET for sizingRatio = 0.50 (lower boundary)', () => {
    const tags = analyze([makeAction({ id: 4, sizingRatio: 0.50 })]);
    expect(tags.map(t => t.tag)).toContain('HALF_POT_BET');
  });

  it('tags HALF_POT_BET for sizingRatio = 0.79 (upper boundary)', () => {
    const tags = analyze([makeAction({ id: 5, sizingRatio: 0.79 })]);
    expect(tags.map(t => t.tag)).toContain('HALF_POT_BET');
  });

  it('tags POT_BET for sizingRatio = 0.80 (lower boundary)', () => {
    const tags = analyze([makeAction({ id: 6, sizingRatio: 0.80 })]);
    expect(tags.map(t => t.tag)).toContain('POT_BET');
  });

  it('tags POT_BET for sizingRatio = 1.10 (upper boundary, inclusive)', () => {
    const tags = analyze([makeAction({ id: 7, sizingRatio: 1.10 })]);
    expect(tags.map(t => t.tag)).toContain('POT_BET');
  });

  it('tags OVERBET for sizingRatio just above 1.10 (e.g. 1.11)', () => {
    const tags = analyze([makeAction({ id: 8, sizingRatio: 1.11 })]);
    expect(tags.map(t => t.tag)).toContain('OVERBET');
  });

  it('tags OVERBET for sizingRatio = 2.00 (upper boundary, inclusive)', () => {
    const tags = analyze([makeAction({ id: 9, sizingRatio: 2.00 })]);
    expect(tags.map(t => t.tag)).toContain('OVERBET');
  });

  it('tags OVERBET_JAM for sizingRatio > 2.00 (boundary 2.01)', () => {
    const tags = analyze([makeAction({ id: 10, sizingRatio: 2.01 })]);
    expect(tags.map(t => t.tag)).toContain('OVERBET_JAM');
  });

  // ── Tag metadata ──────────────────────────────────────────────────────────

  it('includes player_id and action_id on every sizing tag', () => {
    const tags = analyze([makeAction({ id: 42, player_id: 'alice', sizingRatio: 0.6 })]);
    expect(tags).toHaveLength(1);
    expect(tags[0].player_id).toBe('alice');
    expect(tags[0].action_id).toBe(42);
    expect(tags[0].tag_type).toBe('sizing');
  });

  // ── Non-bet/raise actions should not be tagged ─────────────────────────────

  it('does NOT tag fold actions', () => {
    const tags = analyze([makeAction({ action: 'fold', sizingRatio: 0.5 })]);
    expect(tags).toHaveLength(0);
  });

  it('does NOT tag check actions', () => {
    const tags = analyze([makeAction({ action: 'check', sizingRatio: null })]);
    expect(tags).toHaveLength(0);
  });

  it('does NOT tag call actions', () => {
    const tags = analyze([makeAction({ action: 'call', sizingRatio: 0.5 })]);
    expect(tags).toHaveLength(0);
  });

  // ── Preflop actions are skipped ───────────────────────────────────────────

  it('does NOT tag bets/raises on the preflop street', () => {
    const tags = analyze([makeAction({ action: 'bet', street: 'preflop', sizingRatio: 0.5 })]);
    expect(tags).toHaveLength(0);
  });

  it('does NOT tag actions with null sizingRatio', () => {
    const tags = analyze([makeAction({ action: 'bet', street: 'flop', sizingRatio: null })]);
    expect(tags).toHaveLength(0);
  });

  // ── Raise actions are tagged (not just bets) ───────────────────────────────

  it('tags raise actions on the turn', () => {
    const tags = analyze([makeAction({ action: 'raise', street: 'turn', sizingRatio: 1.5 })]);
    expect(tags.map(t => t.tag)).toContain('OVERBET');
  });

  // ── Multiple actions produce multiple tags ────────────────────────────────

  it('produces one tag per qualifying action', () => {
    const actions = [
      makeAction({ id: 1, player_id: 'p1', street: 'flop',  action: 'bet',   sizingRatio: 0.3 }),
      makeAction({ id: 2, player_id: 'p2', street: 'turn',  action: 'raise', sizingRatio: 1.0 }),
      makeAction({ id: 3, player_id: 'p1', street: 'river', action: 'bet',   sizingRatio: 2.5 }),
    ];
    const tags = analyze(actions);
    expect(tags).toHaveLength(3);
    expect(tags.map(t => t.tag)).toEqual(['THIRD_POT_BET', 'POT_BET', 'OVERBET_JAM']);
    expect(tags.map(t => t.action_id)).toEqual([1, 2, 3]);
  });

});
