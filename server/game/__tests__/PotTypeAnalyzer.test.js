'use strict';

const PotTypeAnalyzer = require('../tagAnalyzers/potType');

// Helper: build a minimal ctx with sensible defaults
function makeCtx(overrides = {}) {
  return {
    hand: { big_blind: 20, final_pot: 0, ...overrides.hand },
    actions: overrides.actions || [],
    byStreet: { preflop: [], flop: [], turn: [], river: [], ...overrides.byStreet },
    seated: overrides.seated || [],
  };
}

describe('PotTypeAnalyzer', () => {
  // ── WHALE_POT ────────────────────────────────────────────────────────────────

  it('tags WHALE_POT when final_pot exceeds 150× big blind', () => {
    // 20 BB × 150 = 3000; need > 3000
    const ctx = makeCtx({ hand: { big_blind: 20, final_pot: 3001 } });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('WHALE_POT');
  });

  it('does NOT tag WHALE_POT when final_pot equals exactly 150× big blind', () => {
    const ctx = makeCtx({ hand: { big_blind: 20, final_pot: 3000 } });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WHALE_POT');
  });

  it('does NOT tag WHALE_POT when final_pot is small', () => {
    const ctx = makeCtx({ hand: { big_blind: 20, final_pot: 100 } });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WHALE_POT');
  });

  // ── MULTIWAY ─────────────────────────────────────────────────────────────────

  it('tags MULTIWAY when 3+ players act (non-fold) on the flop', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { player_id: 'p1', action: 'check' },
          { player_id: 'p2', action: 'bet', amount: 20 },
          { player_id: 'p3', action: 'call', amount: 20 },
          { player_id: 'p1', action: 'call', amount: 20 },
        ],
        turn: [], river: [],
      },
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MULTIWAY');
  });

  it('does NOT tag MULTIWAY with only 2 players on the flop', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { player_id: 'p1', action: 'check' },
          { player_id: 'p2', action: 'bet', amount: 20 },
          { player_id: 'p1', action: 'call', amount: 20 },
        ],
        turn: [], river: [],
      },
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('MULTIWAY');
  });

  it('tags MULTIWAY via preflop actors when no flop actions exist', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: 20 },
          { player_id: 'p2', action: 'call', amount: 20 },
          { player_id: 'p3', action: 'raise', amount: 40 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MULTIWAY');
  });

  it('excludes folding preflop players from MULTIWAY count when no flop', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'fold' },
          { player_id: 'p2', action: 'fold' },
          { player_id: 'p3', action: 'raise', amount: 40 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('MULTIWAY');
  });

  // ── SHORT_STACK ───────────────────────────────────────────────────────────────

  it('tags SHORT_STACK when a player starts with less than 20× big blind', () => {
    // 20 BB × 20 = 400; short stack = anything < 400
    const ctx = makeCtx({
      hand: { big_blind: 20, final_pot: 0 },
      seated: [
        { player_id: 'p1', stack_start: 399 },
        { player_id: 'p2', stack_start: 1000 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SHORT_STACK');
  });

  it('does NOT tag SHORT_STACK when all stacks are at or above 20× big blind', () => {
    const ctx = makeCtx({
      hand: { big_blind: 20, final_pot: 0 },
      seated: [
        { player_id: 'p1', stack_start: 400 },
        { player_id: 'p2', stack_start: 800 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SHORT_STACK');
  });

  // ── DEEP_STACK ────────────────────────────────────────────────────────────────

  it('tags DEEP_STACK when a player starts with more than 100× big blind', () => {
    // 20 BB × 100 = 2000; deep stack = anything > 2000
    const ctx = makeCtx({
      hand: { big_blind: 20, final_pot: 0 },
      seated: [
        { player_id: 'p1', stack_start: 2001 },
        { player_id: 'p2', stack_start: 500 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('DEEP_STACK');
  });

  it('does NOT tag DEEP_STACK when all stacks are at or below 100× big blind', () => {
    const ctx = makeCtx({
      hand: { big_blind: 20, final_pot: 0 },
      seated: [
        { player_id: 'p1', stack_start: 2000 },
        { player_id: 'p2', stack_start: 500 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('DEEP_STACK');
  });

  it('can tag both SHORT_STACK and DEEP_STACK in the same hand', () => {
    const ctx = makeCtx({
      hand: { big_blind: 20, final_pot: 0 },
      seated: [
        { player_id: 'p1', stack_start: 200 },  // < 20 BB → short
        { player_id: 'p2', stack_start: 5000 }, // > 100 BB → deep
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SHORT_STACK');
    expect(tags).toContain('DEEP_STACK');
  });

  // ── OVERBET ───────────────────────────────────────────────────────────────────

  it('tags OVERBET when a bet exceeds 2× pot at action time', () => {
    // pot_at_action = 100, amount = 201 → 201 > 200 → OVERBET
    const ctx = makeCtx({
      actions: [
        { player_id: 'p1', action: 'bet', amount: 201, pot_at_action: 100, sizingRatio: 2.01 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('OVERBET');
  });

  it('tags OVERBET when a raise exceeds 2× pot at action time', () => {
    const ctx = makeCtx({
      actions: [
        { player_id: 'p1', action: 'raise', amount: 300, pot_at_action: 100, sizingRatio: 3.0 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('OVERBET');
  });

  it('does NOT tag OVERBET when bet is exactly 2× pot', () => {
    const ctx = makeCtx({
      actions: [
        { player_id: 'p1', action: 'bet', amount: 200, pot_at_action: 100, sizingRatio: 2.0 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OVERBET');
  });

  it('does NOT tag OVERBET for a normal-sized bet', () => {
    const ctx = makeCtx({
      actions: [
        { player_id: 'p1', action: 'bet', amount: 50, pot_at_action: 100, sizingRatio: 0.5 },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OVERBET');
  });

  it('does NOT tag OVERBET when amount or pot_at_action is 0', () => {
    const ctx = makeCtx({
      actions: [
        { player_id: 'p1', action: 'bet', amount: 0, pot_at_action: 100, sizingRatio: 0 },
        { player_id: 'p2', action: 'raise', amount: 300, pot_at_action: 0, sizingRatio: null },
      ],
    });
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OVERBET');
  });

  // ── No tags on empty ctx ──────────────────────────────────────────────────────

  it('returns an empty array when all fields are empty/zero', () => {
    const ctx = makeCtx();
    const tags = PotTypeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WHALE_POT');
    expect(tags).not.toContain('MULTIWAY');
    expect(tags).not.toContain('SHORT_STACK');
    expect(tags).not.toContain('DEEP_STACK');
    expect(tags).not.toContain('OVERBET');
  });
});
