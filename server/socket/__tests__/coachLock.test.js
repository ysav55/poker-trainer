'use strict';

const SharedState = require('../../state/SharedState.js');

function makeSocket({ stableId = 'coach-a', isCoach = true, role = 'coach' } = {}) {
  return {
    data: { stableId, isCoach, role, userId: stableId },
    join: jest.fn(),
    emit: jest.fn(),
    rooms: new Set(),
  };
}

beforeEach(() => {
  SharedState.activeCoachLocks.clear();
  SharedState.pendingBlinds.clear();
});

describe('coach lock — claim on join_room (acting as coach)', () => {
  it('first coach claims the lock', async () => {
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket();
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(true);
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
  });

  it('same coach reconnecting reclaims the lock (multi-tab safe)', async () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'coach-a' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(true);
    expect(SharedState.activeCoachLocks.get('t1')).toBe('coach-a');
  });

  it('different coach is denied and downgraded to observer', async () => {
    SharedState.activeCoachLocks.set('t1', 'coach-a');
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'coach-b' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: true });
    expect(result.granted).toBe(false);
    expect(result.reason).toBe('coach_lock_held');
  });

  it('non-coach (actingAsCoach=false) does not claim a lock', async () => {
    const claim = require('../handlers/joinRoom.js').claimCoachLockIfActingAsCoach;
    const sock = makeSocket({ stableId: 'student-x', isCoach: false, role: 'coached_student' });
    const result = await claim(sock, { tableId: 't1', actingAsCoach: false });
    expect(result.granted).toBe(true); // observer/student joins are always allowed
    expect(SharedState.activeCoachLocks.has('t1')).toBe(false);
  });
});
