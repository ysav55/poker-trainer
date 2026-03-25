'use strict';

const MistakeAnalyzer = require('../tagAnalyzers/mistakes');

const BB = 'bb';
const BB_AMOUNT = 20;

// Helper: build a minimal ctx
function makeCtx(overrides = {}) {
  return {
    hand: { big_blind: BB_AMOUNT, ...overrides.hand },
    allActions: overrides.allActions || [],
    actions: overrides.actions || [],
    byStreet: { preflop: [], flop: [], turn: [], river: [], ...overrides.byStreet },
    bbPlayerId: overrides.bbPlayerId !== undefined ? overrides.bbPlayerId : BB,
  };
}

describe('MistakeAnalyzer', () => {
  // ── UNDO_USED ────────────────────────────────────────────────────────────────

  it('tags UNDO_USED when at least one action has is_reverted: true', () => {
    const ctx = makeCtx({
      allActions: [
        { id: 1, player_id: 'p1', action: 'raise', amount: 40, is_reverted: false },
        { id: 2, player_id: 'p1', action: 'fold', is_reverted: true },
      ],
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('UNDO_USED');
  });

  it('does NOT tag UNDO_USED when no actions are reverted', () => {
    const ctx = makeCtx({
      allActions: [
        { id: 1, player_id: 'p1', action: 'raise', amount: 40, is_reverted: false },
      ],
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('UNDO_USED');
  });

  // ── OPEN_LIMP ─────────────────────────────────────────────────────────────────

  it('tags OPEN_LIMP when non-BB player calls before any raise', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: BB_AMOUNT },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('OPEN_LIMP');
    const limp = tags.find(t => t.tag === 'OPEN_LIMP');
    expect(limp.player_id).toBe('p1');
  });

  it('does NOT tag OPEN_LIMP for the BB posting (BB calls)', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: BB, action: 'call', amount: BB_AMOUNT },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OPEN_LIMP');
  });

  it('does NOT tag OPEN_LIMP when a raise has already occurred', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 40 },
          { player_id: 'p2', action: 'call', amount: 40 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OPEN_LIMP');
  });

  // ── OVERLIMP ──────────────────────────────────────────────────────────────────

  it('tags OVERLIMP when a second player calls after the first limp', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: BB_AMOUNT },
          { player_id: 'p2', action: 'call', amount: BB_AMOUNT },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('OVERLIMP');
    const ol = tags.find(t => t.tag === 'OVERLIMP');
    expect(ol.player_id).toBe('p2');
  });

  it('does NOT tag OVERLIMP when a raise comes before the second call', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: BB_AMOUNT },
          { player_id: 'p2', action: 'raise', amount: 60 },
          { player_id: 'p3', action: 'call', amount: 60 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('OVERLIMP');
  });

  // ── LIMP_RERAISE ──────────────────────────────────────────────────────────────

  it('tags LIMP_RERAISE when a player limped then re-raises after an open', () => {
    // Sequence: p1 limps, p2 raises (open), p1 raises again (limp-reraise)
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: BB_AMOUNT },
          { player_id: 'p2', action: 'raise', amount: 60 },
          { player_id: 'p1', action: 'raise', amount: 200 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('LIMP_RERAISE');
    const lr = tags.find(t => t.tag === 'LIMP_RERAISE');
    expect(lr.player_id).toBe('p1');
  });

  it('does NOT tag LIMP_RERAISE when the player never limped', () => {
    // p3 raises fresh (no prior limp by p3)
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call', amount: BB_AMOUNT },
          { player_id: 'p2', action: 'raise', amount: 60 },
          { player_id: 'p3', action: 'raise', amount: 200 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('LIMP_RERAISE');
  });

  // ── COLD_CALL_3BET ────────────────────────────────────────────────────────────

  it('tags COLD_CALL_3BET when a player with no prior chips calls a 3-bet', () => {
    // p1 opens (1st raise), p2 3-bets (2nd raise), p3 cold-calls with no prior investment
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 40 },
          { player_id: 'p2', action: 'raise', amount: 120 },
          { player_id: 'p3', action: 'call', amount: 120 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('COLD_CALL_3BET');
    const cc = tags.find(t => t.tag === 'COLD_CALL_3BET');
    expect(cc.player_id).toBe('p3');
  });

  it('does NOT tag COLD_CALL_3BET when the caller was already invested before the 3-bet', () => {
    // p1 opens, p2 calls (invested), p3 3-bets, p2 calls the 3-bet — p2 was already in
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 40 },
          { player_id: 'p2', action: 'call', amount: 40 },
          { player_id: 'p3', action: 'raise', amount: 120 },
          { player_id: 'p2', action: 'call', amount: 120 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('COLD_CALL_3BET');
  });

  // ── FOLD_TO_PROBE ─────────────────────────────────────────────────────────────

  it('tags FOLD_TO_PROBE when a player folds to a bet with sizingRatio < 0.25', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { id: 10, player_id: 'p1', action: 'bet', amount: 5, pot_at_action: 100, sizingRatio: 0.05 },
          { id: 11, player_id: 'p2', action: 'fold', sizingRatio: null },
        ],
        turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('FOLD_TO_PROBE');
    const ftp = tags.find(t => t.tag === 'FOLD_TO_PROBE');
    expect(ftp.player_id).toBe('p2');
    expect(ftp.action_id).toBe(11);
  });

  it('does NOT tag FOLD_TO_PROBE when bet sizingRatio is >= 0.25', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { id: 10, player_id: 'p1', action: 'bet', amount: 30, pot_at_action: 100, sizingRatio: 0.30 },
          { id: 11, player_id: 'p2', action: 'fold', sizingRatio: null },
        ],
        turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('FOLD_TO_PROBE');
  });

  it('does NOT tag FOLD_TO_PROBE when a raise intervenes before the fold', () => {
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { id: 10, player_id: 'p1', action: 'bet', amount: 5, pot_at_action: 100, sizingRatio: 0.05 },
          { id: 11, player_id: 'p2', action: 'raise', amount: 30 },
          { id: 12, player_id: 'p3', action: 'fold', sizingRatio: null },
        ],
        turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('FOLD_TO_PROBE');
  });

  // ── MIN_RAISE ─────────────────────────────────────────────────────────────────

  it('tags MIN_RAISE preflop when a raise amount is <= 2× big blind (the prev bet)', () => {
    // Preflop: lastBetAmount starts at BB (20). Raise to 20 → 20 <= 20*2 → MIN_RAISE
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { id: 5, player_id: 'p1', action: 'raise', amount: 20 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('MIN_RAISE');
    const mr = tags.find(t => t.tag === 'MIN_RAISE');
    expect(mr.player_id).toBe('p1');
    expect(mr.action_id).toBe(5);
  });

  it('tags MIN_RAISE when raise to exactly 2× prev bet (min-raise boundary)', () => {
    // Preflop: lastBetAmount = 20 (BB). Raise to 40 → 40 <= 40 → MIN_RAISE
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { id: 6, player_id: 'p1', action: 'raise', amount: 40 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MIN_RAISE');
  });

  it('does NOT tag MIN_RAISE when raise is clearly larger than 2× prev bet', () => {
    // BB = 20, raise to 60 → 60 > 40 → no MIN_RAISE
    const ctx = makeCtx({
      byStreet: {
        preflop: [
          { id: 7, player_id: 'p1', action: 'raise', amount: 60 },
        ],
        flop: [], turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('MIN_RAISE');
  });

  it('tags MIN_RAISE postflop when raise is <= 2× the prior bet', () => {
    // Flop: p1 bets 50, p2 raises to 100 → 100 <= 100 → MIN_RAISE
    const ctx = makeCtx({
      byStreet: {
        preflop: [],
        flop: [
          { id: 10, player_id: 'p1', action: 'bet', amount: 50 },
          { id: 11, player_id: 'p2', action: 'raise', amount: 100 },
        ],
        turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).toContain('MIN_RAISE');
  });

  // ── Clean hand — no mistakes ──────────────────────────────────────────────────

  it('returns no mistake tags for a clean hand with no errors', () => {
    const ctx = makeCtx({
      allActions: [
        { id: 1, player_id: 'p1', action: 'raise', amount: 60, is_reverted: false },
        { id: 2, player_id: BB, action: 'call', amount: 60, is_reverted: false },
      ],
      byStreet: {
        preflop: [
          { id: 1, player_id: 'p1', action: 'raise', amount: 60 },
          { id: 2, player_id: BB, action: 'call', amount: 60 },
        ],
        flop: [
          { id: 3, player_id: BB, action: 'check' },
          { id: 4, player_id: 'p1', action: 'bet', amount: 60, pot_at_action: 120, sizingRatio: 0.5 },
          { id: 5, player_id: BB, action: 'fold' },
        ],
        turn: [], river: [],
      },
    });
    const tags = MistakeAnalyzer.analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('UNDO_USED');
    expect(tags).not.toContain('OPEN_LIMP');
    expect(tags).not.toContain('OVERLIMP');
    expect(tags).not.toContain('LIMP_RERAISE');
    expect(tags).not.toContain('COLD_CALL_3BET');
    expect(tags).not.toContain('FOLD_TO_PROBE');
    expect(tags).not.toContain('MIN_RAISE');
  });
});
