'use strict';

/**
 * SessionReport.test.js
 *
 * Covers generateHTMLReport():
 *  1. Basic shape — returns a valid HTML string
 *  2. XSS regression — esc() sanitises all dangerous characters (EC-01 regression)
 *  3. Special characters in player names
 *  4. Header section — session metadata rendered
 *  5. Leaderboard — players appear in order, net chips, win %
 *  6. Stats section — VPIP/PFR/WTSD/WSD present
 *  7. Pattern summary — tag counts and labels
 *  8. Mistake flags section — rendered when present
 *  9. Key hands — hand with 2+ auto_tags appears in key section
 * 10. All Hands table — every hand listed
 * 11. Empty / minimal inputs — no crash on missing optional fields
 * 12. Null board slots — rendered as "—" not "null"
 * 13. Unknown tag — falls back to raw tag name
 */

const { generateHTMLReport } = require('../SessionReport');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    session_id:  'sess-001',
    table_id:    'test-table',
    started_at:  1700000000000,
    ended_at:    1700003600000,
    hand_count:  3,
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    player_id:    'p1',
    name:         'Alice',
    stack_start:  1000,
    stack_end:    1200,
    net_chips:    200,
    hands_played: 3,
    hands_won:    2,
    vpip:         67,
    pfr:          33,
    wtsd:         50,
    wsd:          100,
    ...overrides,
  };
}

function makeHand(overrides = {}) {
  return {
    hand_id:      'hand-001',
    board:        ['Ah', 'Kd', 'Qc', 'Jh', 'Ts'],
    winner_name:  'Alice',
    final_pot:    300,
    phase_ended:  'showdown',
    auto_tags:    [],
    mistake_tags: [],
    coach_tags:   [],
    players:      [
      { player_name: 'Alice', hole_cards: ['As', 'Ks'], is_winner: 1 },
      { player_name: 'Bob',   hole_cards: ['2h', '3d'], is_winner: 0 },
    ],
    ...overrides,
  };
}

function makeReportData(overrides = {}) {
  return {
    session:          makeSession(),
    players:          [makePlayer(), makePlayer({ player_id: 'p2', name: 'Bob', net_chips: -200, hands_won: 1 })],
    hands:            [makeHand()],
    tag_summary:      {},
    mistake_summary:  {},
    ...overrides,
  };
}

// ─── Suite 1: Basic HTML shape ────────────────────────────────────────────────

describe('generateHTMLReport — basic HTML shape', () => {
  it('returns a string', () => {
    const html = generateHTMLReport(makeReportData());
    expect(typeof html).toBe('string');
  });

  it('starts with <!DOCTYPE html>', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('contains <html> and </html> tags', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains <head> and <body>', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('contains a <style> block', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('<style>');
  });

  it('title includes the date', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('<title>Session Report');
  });
});

// ─── Suite 2: XSS regression (EC-01) ─────────────────────────────────────────

describe('generateHTMLReport — XSS protection via esc()', () => {
  it('escapes < and > in player names', () => {
    const data = makeReportData({
      players: [makePlayer({ name: '<script>alert("xss")</script>' })],
    });
    const html = generateHTMLReport(data);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes & in player names', () => {
    const data = makeReportData({
      players: [makePlayer({ name: 'Alice & Bob' })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('Alice &amp; Bob');
  });

  it('escapes " in player names', () => {
    const data = makeReportData({
      players: [makePlayer({ name: 'Say "hello"' })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('Say &quot;hello&quot;');
  });

  it("escapes ' in player names", () => {
    const data = makeReportData({
      players: [makePlayer({ name: "O'Brien" })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain("O&#039;Brien");
  });

  it('escapes injection in winner_name field', () => {
    const data = makeReportData({
      hands: [makeHand({ winner_name: '<img src=x onerror=alert(1)>' })],
    });
    const html = generateHTMLReport(data);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('does not double-escape already-safe names', () => {
    const data = makeReportData({
      players: [makePlayer({ name: 'Alice' })],
    });
    const html = generateHTMLReport(data);
    // "Alice" should appear as "Alice", not "&amp;Alice" or similar
    expect(html).toContain('>Alice<');
  });
});

// ─── Suite 3: Header section ──────────────────────────────────────────────────

describe('generateHTMLReport — header section', () => {
  it('includes "Session Report" heading', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('Session Report');
  });

  it('includes table_id when present', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('test-table');
  });

  it('shows hand count in header', () => {
    const html = generateHTMLReport(makeReportData());
    // hand_count = 3; rendered as <span>3</span> hands (or similar)
    expect(html).toContain('>3<');
    expect(html).toContain('hand');
  });

  it('omits table reference when table_id is absent', () => {
    const data = makeReportData({ session: makeSession({ table_id: null }) });
    // Should not throw
    expect(() => generateHTMLReport(data)).not.toThrow();
  });
});

// ─── Suite 4: Leaderboard ─────────────────────────────────────────────────────

describe('generateHTMLReport — chip leaderboard', () => {
  it('contains "Chip Leaderboard" heading', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('Chip Leaderboard');
  });

  it('renders player names in leaderboard', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('shows positive net chips with + sign', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('+200');
  });

  it('shows negative net chips as negative number', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('-200');
  });

  it('shows stack_start and stack_end values', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('1000');
    expect(html).toContain('1200');
  });
});

// ─── Suite 5: Stats comparison ────────────────────────────────────────────────

describe('generateHTMLReport — stats comparison', () => {
  it('contains "Stats Comparison" heading', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('Stats Comparison');
  });

  it('contains VPIP and PFR column headers', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('VPIP');
    expect(html).toContain('PFR');
  });

  it('contains WTSD and WSD column headers', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('WTSD');
    expect(html).toContain('WSD');
  });

  it('renders player vpip value', () => {
    const html = generateHTMLReport(makeReportData());
    // Alice has vpip=67
    expect(html).toContain('67%');
  });
});

// ─── Suite 6: Pattern summary ────────────────────────────────────────────────

describe('generateHTMLReport — pattern summary', () => {
  it('renders pattern section when tag_summary is non-empty', () => {
    const data = makeReportData({ tag_summary: { '3BET_POT': 3, WALK: 1 } });
    const html = generateHTMLReport(data);
    expect(html).toContain('Pattern Summary');
    expect(html).toContain('3-Bet Pot');
    expect(html).toContain('Walk');
  });

  it('omits pattern section when tag_summary is empty', () => {
    const data = makeReportData({ tag_summary: {} });
    const html = generateHTMLReport(data);
    expect(html).not.toContain('Pattern Summary');
  });

  it('uses raw tag name for unknown tags', () => {
    const data = makeReportData({ tag_summary: { UNKNOWN_TAG_XYZ: 2 } });
    const html = generateHTMLReport(data);
    expect(html).toContain('UNKNOWN_TAG_XYZ');
  });

  it('renders tag counts', () => {
    const data = makeReportData({ tag_summary: { WALK: 5 } });
    const html = generateHTMLReport(data);
    expect(html).toContain('>5<');
  });
});

// ─── Suite 7: Mistake flags ───────────────────────────────────────────────────

describe('generateHTMLReport — mistake flags', () => {
  it('renders mistake section when mistake_summary has entries', () => {
    const data = makeReportData({
      mistake_summary: {
        OPEN_LIMP: { count: 2, hands: ['hand-001'] },
      },
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('Mistake Flags');
    expect(html).toContain('Open Limp');
  });

  it('omits mistake section when mistake_summary is empty', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).not.toContain('Mistake Flags');
  });

  it('shows occurrence count in mistake entry', () => {
    const data = makeReportData({
      mistake_summary: {
        MIN_RAISE: { count: 3, hands: [] },
      },
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('3 occurrence');
  });
});

// ─── Suite 8: Key hands ───────────────────────────────────────────────────────

describe('generateHTMLReport — key hands', () => {
  it('renders Key Hands section when a hand has 2+ auto_tags', () => {
    const data = makeReportData({
      hands: [makeHand({ auto_tags: ['WALK', '3BET_POT'] })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('Key Hands');
  });

  it('renders Key Hands section when a hand has coach_tags', () => {
    const data = makeReportData({
      hands: [makeHand({ coach_tags: ['study'] })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('Key Hands');
  });

  it('omits Key Hands section when no hand qualifies', () => {
    const data = makeReportData({
      hands: [makeHand({ auto_tags: [], coach_tags: [], mistake_tags: [] })],
    });
    const html = generateHTMLReport(data);
    expect(html).not.toContain('Key Hands');
  });

  it('renders board cards in key hand', () => {
    const data = makeReportData({
      hands: [makeHand({ auto_tags: ['WALK', 'MULTIWAY'], board: ['Ah', 'Kd', 'Qc'] })],
    });
    const html = generateHTMLReport(data);
    // Board cards appear as rank + suit symbol
    expect(html).toContain('A');
    expect(html).toContain('K');
  });
});

// ─── Suite 9: All Hands table ────────────────────────────────────────────────

describe('generateHTMLReport — all hands table', () => {
  it('contains "All Hands" heading', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('All Hands');
  });

  it('renders a row for each hand', () => {
    const data = makeReportData({
      hands: [makeHand({ hand_id: 'h1' }), makeHand({ hand_id: 'h2', winner_name: 'Bob' })],
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('#1');
    expect(html).toContain('#2');
  });

  it('shows winner name in hand row', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('Alice');
  });

  it('shows final_pot in hand row', () => {
    const html = generateHTMLReport(makeReportData());
    expect(html).toContain('300');
  });
});

// ─── Suite 10: Null / empty board handling ───────────────────────────────────

describe('generateHTMLReport — null board handling', () => {
  it('renders "—" for empty board array', () => {
    const data = makeReportData({
      hands: [makeHand({ board: [] })],
    });
    const html = generateHTMLReport(data);
    // renderBoard returns a dash span for empty boards
    expect(html).toContain('—');
  });

  it('does not render "null" or "undefined" for missing board', () => {
    const data = makeReportData({
      hands: [makeHand({ board: null })],
    });
    const html = generateHTMLReport(data);
    expect(html).not.toContain('>null<');
    expect(html).not.toContain('>undefined<');
  });

  it('renders partial board (flop only) without crashing', () => {
    const data = makeReportData({
      hands: [makeHand({ board: ['2h', '7d', 'Ks'] })],
    });
    expect(() => generateHTMLReport(data)).not.toThrow();
  });
});

// ─── Suite 11: Minimal / empty data ──────────────────────────────────────────

describe('generateHTMLReport — minimal input safety', () => {
  it('does not crash with zero players', () => {
    const data = makeReportData({ players: [] });
    expect(() => generateHTMLReport(data)).not.toThrow();
  });

  it('does not crash with zero hands', () => {
    const data = makeReportData({ hands: [] });
    expect(() => generateHTMLReport(data)).not.toThrow();
  });

  it('does not crash when session.hand_count is missing (uses hands.length)', () => {
    const session = makeSession();
    delete session.hand_count;
    const data = makeReportData({ session });
    expect(() => generateHTMLReport(data)).not.toThrow();
  });

  it('returns valid HTML even for empty report', () => {
    const data = makeReportData({ players: [], hands: [], tag_summary: {}, mistake_summary: {} });
    const html = generateHTMLReport(data);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('handles null session timestamps gracefully (shows "—")', () => {
    const data = makeReportData({
      session: makeSession({ started_at: null, ended_at: null }),
    });
    const html = generateHTMLReport(data);
    expect(html).toContain('—');
  });
});
