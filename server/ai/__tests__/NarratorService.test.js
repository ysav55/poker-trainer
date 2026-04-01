'use strict';

/**
 * NarratorService unit tests.
 *
 * Covers:
 *   - Returns null when ANTHROPIC_API_KEY is not set
 *   - Returns null for empty/null inputs
 *   - Returns LLM text on successful API response
 *   - Degrades gracefully (returns null) on fetch error
 *   - Degrades gracefully (returns null) on non-OK HTTP response
 *   - narrateAlerts: separates urgent / moderate / milestone tiers
 *   - narratePrepBrief: trims payload to key sections
 *   - narrateProgressReport: passes data through
 *   - narrateStableOverview: passes data through
 */

// ─── fetch mock ───────────────────────────────────────────────────────────────

let mockFetchImpl;

global.fetch = jest.fn((...args) => mockFetchImpl(...args));

function mockSuccessResponse(text) {
  mockFetchImpl = jest.fn().mockResolvedValue({
    ok:   true,
    json: async () => ({ content: [{ type: 'text', text }] }),
  });
}

function mockErrorResponse(status = 500) {
  mockFetchImpl = jest.fn().mockResolvedValue({ ok: false, status });
}

function mockFetchThrow(msg = 'network error') {
  mockFetchImpl = jest.fn().mockRejectedValue(new Error(msg));
}

// ─── Module under test ────────────────────────────────────────────────────────

const NarratorService = require('../NarratorService');

// ─── Setup ────────────────────────────────────────────────────────────────────

const ORIG_API_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  mockFetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterAll(() => {
  if (ORIG_API_KEY) process.env.ANTHROPIC_API_KEY = ORIG_API_KEY;
});

// ─── Common: no API key ───────────────────────────────────────────────────────

describe('when ANTHROPIC_API_KEY is not set', () => {
  const SAMPLE_ALERTS = [{ id: 'a1', alert_type: 'inactivity', severity: 0.9 }];

  test('narrateAlerts returns null', async () => {
    expect(await NarratorService.narrateAlerts(SAMPLE_ALERTS, [])).toBeNull();
  });

  test('narratePrepBrief returns null', async () => {
    expect(await NarratorService.narratePrepBrief({ leaks: [] })).toBeNull();
  });

  test('narrateProgressReport returns null', async () => {
    expect(await NarratorService.narrateProgressReport({ data: 'x' })).toBeNull();
  });

  test('narrateStableOverview returns null', async () => {
    expect(await NarratorService.narrateStableOverview({ students: [] })).toBeNull();
  });

  test('fetch is never called', async () => {
    await NarratorService.narrateAlerts(SAMPLE_ALERTS, []);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Common: null / empty inputs ─────────────────────────────────────────────

describe('null or empty inputs', () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; });

  test('narrateAlerts(null) returns null without calling fetch', async () => {
    expect(await NarratorService.narrateAlerts(null, [])).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('narrateAlerts([]) returns null without calling fetch', async () => {
    expect(await NarratorService.narrateAlerts([], [])).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('narratePrepBrief(null) returns null without calling fetch', async () => {
    expect(await NarratorService.narratePrepBrief(null)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('narrateProgressReport(null) returns null without calling fetch', async () => {
    expect(await NarratorService.narrateProgressReport(null)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('narrateStableOverview(null) returns null without calling fetch', async () => {
    expect(await NarratorService.narrateStableOverview(null)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

describe('graceful degradation', () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; });

  test('returns null when fetch throws (network error)', async () => {
    mockFetchThrow('network error');
    const result = await NarratorService.narrateAlerts(
      [{ id: 'a1', alert_type: 'inactivity', severity: 0.9 }], []
    );
    expect(result).toBeNull();
  });

  test('returns null on non-OK HTTP response', async () => {
    mockErrorResponse(500);
    const result = await NarratorService.narratePrepBrief({ leaks: [] });
    expect(result).toBeNull();
  });

  test('returns null when API response has no text content', async () => {
    mockFetchImpl = jest.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ content: [] }),
    });
    const result = await NarratorService.narrateProgressReport({ data: 'x' });
    expect(result).toBeNull();
  });
});

// ─── narrateAlerts ────────────────────────────────────────────────────────────

describe('narrateAlerts', () => {
  const EXPECTED_TEXT = 'Alex needs attention. Marcus is improving.';

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockSuccessResponse(EXPECTED_TEXT);
  });

  test('returns LLM text on success', async () => {
    const alerts = [{ id: 'a1', alert_type: 'inactivity', severity: 0.9, data: {} }];
    const result = await NarratorService.narrateAlerts(alerts, []);
    expect(result).toBe(EXPECTED_TEXT);
  });

  test('sends a POST to the Anthropic API', async () => {
    const alerts = [{ id: 'a1', alert_type: 'inactivity', severity: 0.9, data: {} }];
    await NarratorService.narrateAlerts(alerts, []);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('sends api key in header', async () => {
    const alerts = [{ id: 'a1', alert_type: 'inactivity', severity: 0.9, data: {} }];
    await NarratorService.narrateAlerts(alerts, []);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['x-api-key']).toBe('test-key');
  });

  test('separates alerts into urgent / moderate / milestone tiers in payload', async () => {
    const alerts = [
      { id: 'a1', alert_type: 'inactivity',        severity: 0.9, data: {} },
      { id: 'a2', alert_type: 'volume_drop',        severity: 0.5, data: {} },
      { id: 'a3', alert_type: 'positive_milestone', severity: 0.0, data: {} },
    ];
    await NarratorService.narrateAlerts(alerts, [{ id: 'p1' }, { id: 'p2' }]);

    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    const userContent = body.messages[0].content;
    const payload = JSON.parse(userContent.replace(/^[^\n]+\n\n/, ''));

    expect(payload.urgent_alerts).toHaveLength(1);
    expect(payload.moderate_alerts).toHaveLength(1);
    expect(payload.milestones).toHaveLength(1);
    expect(payload.stable_stats.total).toBe(2);
  });
});

// ─── narratePrepBrief ─────────────────────────────────────────────────────────

describe('narratePrepBrief', () => {
  const EXPECTED_TEXT = 'Player has high VPIP and several flagged hands.';

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockSuccessResponse(EXPECTED_TEXT);
  });

  test('returns LLM text on success', async () => {
    const result = await NarratorService.narratePrepBrief({ leaks: [], flagged_hands: [] });
    expect(result).toBe(EXPECTED_TEXT);
  });

  test('trims flagged_hands to max 3 in payload', async () => {
    const brief = {
      leaks:         [{ stat: 'vpip' }],
      flagged_hands: Array(10).fill({ hand_id: 'h1' }),
      active_alerts: [],
      stats_snapshot: [],
    };
    await NarratorService.narratePrepBrief(brief);

    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    const userContent = body.messages[0].content;
    const payload = JSON.parse(userContent.replace(/^[^\n]+\n\n/, ''));

    expect(payload.flagged_hands).toHaveLength(3);
  });
});

// ─── narrateProgressReport ────────────────────────────────────────────────────

describe('narrateProgressReport', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockSuccessResponse('Player improved VPIP by 8% over the period.');
  });

  test('returns LLM text on success', async () => {
    const result = await NarratorService.narrateProgressReport({ student: 'Alex', period: '30d' });
    expect(result).toBe('Player improved VPIP by 8% over the period.');
  });

  test('calls fetch once', async () => {
    await NarratorService.narrateProgressReport({ data: 'x' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── narrateStableOverview ────────────────────────────────────────────────────

describe('narrateStableOverview', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockSuccessResponse('The stable is performing well with 28 active students.');
  });

  test('returns LLM text on success', async () => {
    const result = await NarratorService.narrateStableOverview({ students: 28 });
    expect(result).toBe('The stable is performing well with 28 active students.');
  });
});
