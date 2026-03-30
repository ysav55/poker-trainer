'use strict';

/**
 * Unit tests for the controller factory functions exported from SharedState:
 *   getOrCreateController, getController, destroyController
 *
 * SharedState is a singleton module. We use jest.resetModules() in beforeEach
 * so each test gets a fresh module instance (and therefore an empty controllers Map).
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIo() {
  const room = { emit: jest.fn() };
  return { to: jest.fn().mockReturnValue(room) };
}

function makeGm() {
  return {
    getState:  jest.fn().mockReturnValue({ seated: [] }),
    startGame: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SharedState controller factory', () => {
  let getOrCreateController, getController, destroyController;
  let CoachedController, AutoController, TournamentController;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after resetModules so we get a fresh singleton
    const SharedState = require('../SharedState');
    getOrCreateController = SharedState.getOrCreateController;
    getController         = SharedState.getController;
    destroyController     = SharedState.destroyController;

    CoachedController    = require('../../game/controllers/CoachedController').CoachedController;
    AutoController       = require('../../game/controllers/AutoController').AutoController;
    TournamentController = require('../../game/controllers/TournamentController').TournamentController;
  });

  // ── getOrCreateController ──────────────────────────────────────────────────

  describe('getOrCreateController', () => {
    test('returns a CoachedController for mode coached_cash', () => {
      const ctrl = getOrCreateController('t-coached', 'coached_cash', makeGm(), makeIo());
      expect(ctrl).toBeInstanceOf(CoachedController);
    });

    test('returns an AutoController for mode uncoached_cash', () => {
      const ctrl = getOrCreateController('t-auto', 'uncoached_cash', makeGm(), makeIo());
      expect(ctrl).toBeInstanceOf(AutoController);
    });

    test('returns a TournamentController for mode tournament', () => {
      const ctrl = getOrCreateController('t-tourn', 'tournament', makeGm(), makeIo());
      expect(ctrl).toBeInstanceOf(TournamentController);
    });

    test('returns same instance when called twice with the same tableId', () => {
      const gm = makeGm();
      const io = makeIo();
      const ctrl1 = getOrCreateController('t-same', 'coached_cash', gm, io);
      const ctrl2 = getOrCreateController('t-same', 'coached_cash', gm, io);
      expect(ctrl1).toBe(ctrl2);
    });

    test('defaults to CoachedController for unknown mode', () => {
      const ctrl = getOrCreateController('t-unknown', 'some_unknown_mode', makeGm(), makeIo());
      expect(ctrl).toBeInstanceOf(CoachedController);
    });
  });

  // ── getController ──────────────────────────────────────────────────────────

  describe('getController', () => {
    test('returns null for an unknown tableId', () => {
      expect(getController('t-nonexistent')).toBeNull();
    });

    test('returns the controller after it has been created', () => {
      const ctrl = getOrCreateController('t-get', 'coached_cash', makeGm(), makeIo());
      expect(getController('t-get')).toBe(ctrl);
    });
  });

  // ── destroyController ──────────────────────────────────────────────────────

  describe('destroyController', () => {
    test('calls ctrl.destroy() on the controller', () => {
      const ctrl = getOrCreateController('t-destroy', 'coached_cash', makeGm(), makeIo());
      jest.spyOn(ctrl, 'destroy');
      destroyController('t-destroy');
      expect(ctrl.destroy).toHaveBeenCalledTimes(1);
    });

    test('sets ctrl.active to false via destroy()', () => {
      const ctrl = getOrCreateController('t-active', 'coached_cash', makeGm(), makeIo());
      expect(ctrl.active).toBe(true);
      destroyController('t-active');
      expect(ctrl.active).toBe(false);
    });

    test('removes the controller from the map', () => {
      getOrCreateController('t-remove', 'coached_cash', makeGm(), makeIo());
      destroyController('t-remove');
      expect(getController('t-remove')).toBeNull();
    });

    test('is a no-op for an unknown tableId (does not throw)', () => {
      expect(() => destroyController('t-noop')).not.toThrow();
    });
  });
});
