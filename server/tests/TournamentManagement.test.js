'use strict';

/**
 * Phase 2 — Tournament Management (managedBy) tests.
 *
 * Tests:
 *   TournamentController:
 *   - claimManagement grants on orphaned table
 *   - claimManagement denies when already managed by someone else
 *   - claimManagement allows same user to re-claim (idempotent)
 *   - releaseManagement releases when called by owner
 *   - releaseManagement rejects when called by non-owner
 *   - canSteal: higher role can steal, same/lower cannot
 *   - _setManager broadcasts tournament:manager_changed
 *   - onManagerDisconnect starts 10s timer and releases after expiry
 *   - onManagerReconnect cancels the timer
 *
 *   Socket handlers (unit-level, via handler function calls):
 *   - tournament:steal_management: wrong password → denied
 *   - tournament:steal_management: lower rank → denied
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.useFakeTimers();

const mockIoEmit = jest.fn();
const mockIoTo   = jest.fn(() => ({ emit: mockIoEmit }));
const mockIo     = { to: mockIoTo };

// Minimal GameManager stub
function makeGm() {
  return {
    state: { players: [], seated: [], phase: 'waiting' },
    getState: function () { return this.state; },
  };
}

const { TournamentController } = require('../game/controllers/TournamentController');

function makeCtrl(tableId = 'test-table') {
  return new TournamentController(tableId, makeGm(), mockIo);
}

// ─── TournamentController — management API ────────────────────────────────────

describe('TournamentController — managedBy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('claimManagement grants on orphaned table', () => {
    const ctrl = makeCtrl();
    const result = ctrl.claimManagement('user-1', 'Alice', 'admin');
    expect(result).toBe(true);
    expect(ctrl.managedBy).toBe('user-1');
    expect(ctrl.managerName).toBe('Alice');
    expect(ctrl.managerRole).toBe('admin');
  });

  test('claimManagement denies when already managed by someone else', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    const result = ctrl.claimManagement('user-2', 'Bob', 'coach');
    expect(result).toBe(false);
    expect(ctrl.managedBy).toBe('user-1'); // unchanged
  });

  test('claimManagement allows same user to re-claim (idempotent)', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    const result = ctrl.claimManagement('user-1', 'Alice', 'admin');
    expect(result).toBe(true);
  });

  test('releaseManagement releases when called by owner', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    const result = ctrl.releaseManagement('user-1');
    expect(result).toBe(true);
    expect(ctrl.managedBy).toBeNull();
  });

  test('releaseManagement rejects when called by non-owner', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    const result = ctrl.releaseManagement('user-2');
    expect(result).toBe(false);
    expect(ctrl.managedBy).toBe('user-1'); // unchanged
  });

  test('releaseManagement with force=true bypasses ownership', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    const result = ctrl.releaseManagement('user-2', { force: true });
    expect(result).toBe(true);
    expect(ctrl.managedBy).toBeNull();
  });

  test('canSteal: higher-ranked role can steal', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('ref-1', 'Ref', 'referee');
    expect(ctrl.canSteal('admin')).toBe(true);
    expect(ctrl.canSteal('coach')).toBe(true);
    expect(ctrl.canSteal('superadmin')).toBe(true);
  });

  test('canSteal: same or lower rank cannot steal', () => {
    const ctrl = makeCtrl();
    ctrl.claimManagement('coach-1', 'Coach', 'coach');
    expect(ctrl.canSteal('referee')).toBe(false);
    expect(ctrl.canSteal('coach')).toBe(false);
  });

  test('canSteal returns true when table is orphaned', () => {
    const ctrl = makeCtrl();
    expect(ctrl.canSteal('referee')).toBe(true);
  });

  test('_setManager broadcasts tournament:manager_changed', () => {
    const ctrl = makeCtrl('t1');
    ctrl._setManager('u1', 'Alice', 'admin');
    expect(mockIoTo).toHaveBeenCalledWith('t1');
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:manager_changed', {
      managedBy:   'u1',
      managerName: 'Alice',
    });
  });

  test('_setManager with null broadcasts null (orphaned)', () => {
    const ctrl = makeCtrl('t1');
    ctrl._setManager(null, null, null);
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:manager_changed', {
      managedBy:   null,
      managerName: null,
    });
  });
});

// ─── Disconnect grace window ──────────────────────────────────────────────────

describe('TournamentController — disconnect grace window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('onManagerDisconnect emits tournament:manager_disconnected with expiresAt', () => {
    const ctrl = makeCtrl('t2');
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    jest.clearAllMocks(); // clear claimManagement broadcast

    ctrl.onManagerDisconnect('user-1', 'Alice');

    expect(mockIoTo).toHaveBeenCalledWith('t2');
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:manager_disconnected',
      expect.objectContaining({ managedBy: 'user-1', managerName: 'Alice' })
    );
  });

  test('onManagerDisconnect releases management after 10 seconds', () => {
    const ctrl = makeCtrl('t3');
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    ctrl.onManagerDisconnect('user-1', 'Alice');

    expect(ctrl.managedBy).toBe('user-1'); // still set during grace

    jest.advanceTimersByTime(10_001);

    expect(ctrl.managedBy).toBeNull();
  });

  test('onManagerReconnect cancels the grace timer', () => {
    const ctrl = makeCtrl('t4');
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    ctrl.onManagerDisconnect('user-1', 'Alice');
    ctrl.onManagerReconnect('user-1', 'Alice', 'admin');

    jest.advanceTimersByTime(15_000);

    // Should NOT have been released
    expect(ctrl.managedBy).toBe('user-1');
  });

  test('onManagerDisconnect does nothing if called by non-manager', () => {
    const ctrl = makeCtrl('t5');
    ctrl.claimManagement('user-1', 'Alice', 'admin');
    jest.clearAllMocks();

    ctrl.onManagerDisconnect('user-2', 'Bob'); // not the manager

    jest.advanceTimersByTime(15_000);
    expect(ctrl.managedBy).toBe('user-1'); // unchanged
  });
});
