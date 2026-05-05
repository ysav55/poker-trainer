'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');

const SharedState = require('../../state/SharedState.js');

function makeSocket({ stableId = 'coach-a', isCoach = true } = {}) {
  return {
    data: { stableId, isCoach, userId: stableId },
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  SharedState.tableSharedRanges.clear();
});

describe('coach:share_range', () => {
  it('stores the range for the table and broadcasts to room', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', groups: ['AKo', 'QQ'], label: 'BTN open' }, ack);
    expect(SharedState.tableSharedRanges.get('t1')).toMatchObject({ groups: ['AKo', 'QQ'], label: 'BTN open' });
    expect(sock.to).toHaveBeenCalledWith('t1');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects non-coach', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', groups: ['AKo'], label: 'x' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'coach_only' }));
    expect(SharedState.tableSharedRanges.has('t1')).toBe(false);
  });

  it('rejects missing tableId', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const ack = jest.fn();
    await handler(makeSocket(), { groups: ['AKo'], label: 'x' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_table' }));
  });

  it('rejects empty groups array', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1', groups: [], label: 'x' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_groups' }));
  });

  it('rejects non-string label', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1', groups: ['AKo'], label: 123 }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_label' }));
  });

  it('re-sharing overwrites previous', async () => {
    SharedState.tableSharedRanges.set('t1', { groups: ['AKo'], label: 'old', broadcastedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleShareRange;
    await handler(makeSocket(), { tableId: 't1', groups: ['QQ'], label: 'new' }, jest.fn());
    expect(SharedState.tableSharedRanges.get('t1').groups).toEqual(['QQ']);
    expect(SharedState.tableSharedRanges.get('t1').label).toBe('new');
  });

  it('includes broadcastedAt timestamp', async () => {
    const handler = require('../handlers/coachControls.js').handleShareRange;
    const sock = makeSocket();
    const before = Date.now();
    await handler(sock, { tableId: 't1', groups: ['AKo'], label: 'test' }, jest.fn());
    const after = Date.now();
    const entry = SharedState.tableSharedRanges.get('t1');
    expect(entry.broadcastedAt).toBeGreaterThanOrEqual(before);
    expect(entry.broadcastedAt).toBeLessThanOrEqual(after);
  });
});
