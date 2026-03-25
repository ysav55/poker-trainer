'use strict';

const StreetAnalyzer = require('../tagAnalyzers/street');

describe('StreetAnalyzer', () => {
  // ── WALK ────────────────────────────────────────────────────────────────────

  it('tags WALK when no raises preflop, folds only, and no board', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'fold' },
          { player_id: 'p2', action: 'fold' },
          { player_id: 'bb', action: 'check' },
        ],
      },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('WALK');
  });

  it('does NOT tag WALK when there was a raise preflop', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 40 },
          { player_id: 'p2', action: 'fold' },
          { player_id: 'bb', action: 'fold' },
        ],
      },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WALK');
  });

  it('does NOT tag WALK when board cards are present', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'fold' },
          { player_id: 'bb', action: 'check' },
        ],
      },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WALK');
  });

  // ── SAW_FLOP ────────────────────────────────────────────────────────────────

  it('tags SAW_FLOP when board has 3 cards', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SAW_FLOP');
    expect(tags).not.toContain('SAW_TURN');
    expect(tags).not.toContain('SAW_RIVER');
  });

  // ── SAW_TURN ────────────────────────────────────────────────────────────────

  it('tags SAW_FLOP and SAW_TURN when board has 4 cards', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s'], phase_ended: 'turn' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SAW_FLOP');
    expect(tags).toContain('SAW_TURN');
    expect(tags).not.toContain('SAW_RIVER');
  });

  // ── SAW_RIVER ───────────────────────────────────────────────────────────────

  it('tags SAW_FLOP, SAW_TURN, and SAW_RIVER when board has 5 cards', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SAW_FLOP');
    expect(tags).toContain('SAW_TURN');
    expect(tags).toContain('SAW_RIVER');
  });

  // ── WENT_TO_SHOWDOWN ────────────────────────────────────────────────────────

  it('tags WENT_TO_SHOWDOWN when phase_ended is showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('WENT_TO_SHOWDOWN');
  });

  it('does NOT tag WENT_TO_SHOWDOWN when phase_ended is not showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('WENT_TO_SHOWDOWN');
  });

  // ── COMBINATION ─────────────────────────────────────────────────────────────

  it('fires all 4 board/showdown tags on a 5-card board ending in showdown', () => {
    const ctx = {
      hand: { board: ['2h', '5d', '9c', 'Ks', 'Ah'], phase_ended: 'showdown' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SAW_FLOP');
    expect(tags).toContain('SAW_TURN');
    expect(tags).toContain('SAW_RIVER');
    expect(tags).toContain('WENT_TO_SHOWDOWN');
    expect(tags).not.toContain('WALK');
  });

  it('returns empty array when no board and no preflop actions', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop' },
      byStreet: { preflop: [] },
    };
    const tags = StreetAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toHaveLength(0);
  });
});
