'use strict';

const SharedState = require('../../state/SharedState.js');

function makeSocket({ stableId = 'coach-a', isCoach = true } = {}) {
  return {
    data: { stableId, isCoach, userId: stableId },
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    broadcast: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
  };
}

beforeEach(() => {
  SharedState.pendingBlinds.clear();
});

describe('coach:apply_blinds_at_next_hand', () => {
  it('queues a delta for the table', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 25, bb: 50 }, ack);
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 25, bb: 50, queuedBy: 'coach-a' });
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects non-coach', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 25, bb: 50 }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('validates sb < bb and integers > 0', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1', sb: 50, bb: 25 }, ack); // sb >= bb
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_blinds' }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
  });

  it('re-queueing overwrites the previous delta (single-pending rule)', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 10, bb: 20, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    await handler(sock, { tableId: 't1', sb: 50, bb: 100 }, jest.fn());
    expect(SharedState.pendingBlinds.get('t1')).toMatchObject({ sb: 50, bb: 100 });
  });

  it('broadcasts pending_blinds_updated to room', async () => {
    const handler = require('../handlers/coachControls.js').handleApplyBlindsAtNextHand;
    const sock = makeSocket();
    await handler(sock, { tableId: 't1', sb: 25, bb: 50 }, jest.fn());
    expect(sock.to).toHaveBeenCalledWith('t1');
  });
});

describe('coach:discard_pending_blinds', () => {
  it('clears the pending entry', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(SharedState.pendingBlinds.has('t1')).toBe(false);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('is a no-op if nothing pending', async () => {
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects non-coach', async () => {
    SharedState.pendingBlinds.set('t1', { sb: 25, bb: 50, queuedBy: 'coach-a', queuedAt: 100 });
    const handler = require('../handlers/coachControls.js').handleDiscardPendingBlinds;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'coach_only' }));
    expect(SharedState.pendingBlinds.has('t1')).toBe(true); // unchanged
  });
});
