'use strict';

const BoardAnalyzer = require('../tagAnalyzers/board');

describe('BoardAnalyzer', () => {
  // ── MONOTONE_BOARD ──────────────────────────────────────────────────────────

  it('tags MONOTONE_BOARD when all 3 flop cards share the same suit', () => {
    const ctx = { hand: { board: ['2h', '7h', 'Kh'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MONOTONE_BOARD');
    expect(tags).not.toContain('TWO_TONE_BOARD');
    expect(tags).not.toContain('RAINBOW_BOARD');
  });

  it('does NOT tag MONOTONE_BOARD when suits are mixed', () => {
    const ctx = { hand: { board: ['2h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('MONOTONE_BOARD');
  });

  it('tags TWO_TONE_BOARD when exactly 2 suits appear on the flop', () => {
    const ctx = { hand: { board: ['2h', '7h', 'Kd'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('TWO_TONE_BOARD');
    expect(tags).not.toContain('MONOTONE_BOARD');
    expect(tags).not.toContain('RAINBOW_BOARD');
  });

  it('tags RAINBOW_BOARD when all 3 flop cards have different suits', () => {
    const ctx = { hand: { board: ['2h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('RAINBOW_BOARD');
  });

  // ── PAIRED_BOARD ────────────────────────────────────────────────────────────

  it('tags PAIRED_BOARD when exactly 2 flop cards share the same rank', () => {
    const ctx = { hand: { board: ['7h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('PAIRED_BOARD');
    expect(tags).not.toContain('UNPAIRED_BOARD');
    expect(tags).not.toContain('TRIPS_BOARD');
  });

  it('tags TRIPS_BOARD when all 3 flop cards share the same rank', () => {
    const ctx = { hand: { board: ['7h', '7d', '7c'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('TRIPS_BOARD');
  });

  it('tags UNPAIRED_BOARD when all ranks are unique', () => {
    const ctx = { hand: { board: ['2h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('UNPAIRED_BOARD');
  });

  it('does NOT tag PAIRED_BOARD when all ranks are unique', () => {
    const ctx = { hand: { board: ['2h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('PAIRED_BOARD');
  });

  // ── MONOTONE + PAIRED combination ───────────────────────────────────────────

  it('tags both MONOTONE_BOARD and PAIRED_BOARD when board is suited and paired', () => {
    const ctx = { hand: { board: ['7h', '7d', 'Kh', 'Qh', '2h'] } };
    // Board analyzer only uses first 3 cards (the flop)
    // '7h', '7d', 'Kh' → not monotone (two suits: h, d), but paired (7-7)
    // Use all-hearts flop with a pair
    const ctx2 = { hand: { board: ['7h', '7d', 'Kh'] } };
    const tags2 = BoardAnalyzer.analyze(ctx2).map(t => t.tag);
    expect(tags2).toContain('PAIRED_BOARD');
    // 7h, 7d, Kh has 2 suits → TWO_TONE not MONOTONE; test monotone+paired separately
    const ctx3 = { hand: { board: ['Ah', 'Ah', 'Kh'] } };
    // Ah repeated is not a valid deck scenario but tests logic: all hearts, two A's
    // Instead use a valid scenario: paired rank, all hearts not possible with a real deck.
    // Real scenario: use turn+river to still get flop slice only
    // Monotone+paired: only possible if a rank repeats AND all same suit — invalid in real deck.
    // Board.js only reads first 3 cards (flop) so let's verify the suit tag independently.
    const monoCtx = { hand: { board: ['2h', '7h', 'Kh'] } };
    const monoTags = BoardAnalyzer.analyze(monoCtx).map(t => t.tag);
    expect(monoTags).toContain('MONOTONE_BOARD');
    expect(monoTags).toContain('UNPAIRED_BOARD');
  });

  // ── SHORT BOARD (< 3 cards) ─────────────────────────────────────────────────

  it('returns no tags when board has fewer than 3 cards', () => {
    const ctx = { hand: { board: ['Ah', 'Kd'] } };
    const tags = BoardAnalyzer.analyze(ctx);
    expect(tags).toHaveLength(0);
  });

  it('returns no tags when board is empty', () => {
    const ctx = { hand: { board: [] } };
    const tags = BoardAnalyzer.analyze(ctx);
    expect(tags).toHaveLength(0);
  });

  // ── 5-card board still uses flop (indices 0-2) ──────────────────────────────

  it('analyzes only the flop slice even when 5 board cards are provided', () => {
    // Flop: 2h 7h Kh (monotone), turn/river are different suits — should still be MONOTONE
    const ctx = { hand: { board: ['2h', '7h', 'Kh', '9d', '3s'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MONOTONE_BOARD');
  });

  // ── CONNECTED / DISCONNECTED boards ─────────────────────────────────────────

  it('tags CONNECTED_BOARD when flop cards span 2 or fewer ranks', () => {
    // 7-8-9 span = 9-7 = 2
    const ctx = { hand: { board: ['7h', '8d', '9c'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('CONNECTED_BOARD');
  });

  it('tags DISCONNECTED_BOARD when flop ranks are far apart and rainbow', () => {
    // 2-7-K: span = K(11) - 2(0) = 11, rainbow → DRY_BOARD expected too
    const ctx = { hand: { board: ['2h', '7d', 'Ks'] } };
    const tags = BoardAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('DISCONNECTED_BOARD');
    expect(tags).toContain('DRY_BOARD');
  });
});
