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
  SharedState.tables.clear();
});

describe('coach:manual_advance_spot', () => {
  function makeGM({ active = true, autoAdvance = false, phase = 'waiting' } = {}) {
    return {
      state: {
        phase,
        playlist_mode: { active, auto_advance: autoAdvance },
      },
      advancePlaylist: jest.fn().mockReturnValue({ done: false, currentIndex: 1 }),
    };
  }

  it('rejects non-coach', async () => {
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const sock = makeSocket({ isCoach: false });
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'coach_only' }));
  });

  it('rejects when tableId is missing', async () => {
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: null }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_table' }));
  });

  it('rejects when table is not active', async () => {
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'table_not_active' }));
  });

  it('rejects when drill is not active', async () => {
    SharedState.tables.set('t1', makeGM({ active: false }));
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'drill_not_active' }));
  });

  it('rejects when auto_advance is on', async () => {
    SharedState.tables.set('t1', makeGM({ autoAdvance: true }));
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'auto_advance_on' }));
  });

  it('rejects when phase is not waiting', async () => {
    SharedState.tables.set('t1', makeGM({ phase: 'flop' }));
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'not_in_waiting_phase' }));
  });

  it('calls advancePlaylist when guards pass', async () => {
    const gm = makeGM();
    SharedState.tables.set('t1', gm);
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    expect(gm.advancePlaylist).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('broadcasts notification to room on success', async () => {
    const gm = makeGM();
    SharedState.tables.set('t1', gm);
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const sock = makeSocket();
    const ack = jest.fn();
    await handler(sock, { tableId: 't1' }, ack);
    // socket.to() should have been called
    expect(sock.to).toHaveBeenCalledWith('t1');
    // socket.emit() should have been called
    expect(sock.emit).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({ type: 'drill_advanced' })
    );
  });

  it('returns error if advancePlaylist returns error', async () => {
    const gm = makeGM();
    gm.advancePlaylist.mockReturnValue({ error: 'Invalid state' });
    SharedState.tables.set('t1', gm);
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid state' }));
  });

  it('returns error if advancePlaylist throws', async () => {
    const gm = makeGM();
    gm.advancePlaylist.mockImplementation(() => {
      throw new Error('State corruption');
    });
    SharedState.tables.set('t1', gm);
    const handler = require('../handlers/coachControls.js').handleManualAdvanceSpot;
    const ack = jest.fn();
    await handler(makeSocket(), { tableId: 't1' }, ack);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'advance_failed', message: 'State corruption' })
    );
  });
});
