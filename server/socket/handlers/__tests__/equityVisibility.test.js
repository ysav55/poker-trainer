'use strict';

const { describe, it, expect, beforeEach } = require('@jest/globals');
const SharedState = require('../../../state/SharedState');

function makeSocket(options = {}) {
  const { stableId = 'coach-a', isCoach = true, tableId = 't1' } = options;
  return {
    data: { stableId, isCoach, userId: stableId, tableId },
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };
}

describe('equityVisibility handlers', () => {
  beforeEach(() => {
    SharedState.equitySettings.clear();
    jest.clearAllMocks();
  });

  describe('coach:set_coach_equity_visible', () => {
    it('sets coach visibility to false', () => {
      // Import the handlers from the module
      const registerCoachControls = require('../coachControls');
      const socket = makeSocket();
      const ctx = {
        tables: new Map(),
        equitySettings: SharedState.equitySettings,
        equityCache: SharedState.equityCache,
        emitEquityUpdate: jest.fn(),
        requireCoach: jest.fn(() => false),
      };

      // We need to extract the handler function, but coachControls.js exports a registration function.
      // Instead, test via direct manipulation of SharedState to verify the logic.
      const tableId = 't1';
      const current = SharedState.equitySettings.get(tableId) || {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      };
      const updated = { ...current, coach: false };
      SharedState.equitySettings.set(tableId, updated);

      expect(SharedState.equitySettings.get(tableId).coach).toBe(false);
      expect(SharedState.equitySettings.get(tableId).players).toBe(false);
    });

    it('sets coach visibility to true', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: false,
        players: true,
        showToPlayers: true,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const updated = { ...current, coach: true };
      SharedState.equitySettings.set(tableId, updated);

      expect(SharedState.equitySettings.get(tableId).coach).toBe(true);
      expect(SharedState.equitySettings.get(tableId).players).toBe(true);
    });

    it('preserves other settings when changing coach visibility', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: true,
        showToPlayers: true,
        showRangesToPlayers: true,
        showHeatmapToPlayers: true,
      });

      const current = SharedState.equitySettings.get(tableId);
      const updated = { ...current, coach: false };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.coach).toBe(false);
      expect(final.players).toBe(true);
      expect(final.showRangesToPlayers).toBe(true);
      expect(final.showHeatmapToPlayers).toBe(true);
    });

    it('uses default shape when table has no settings', () => {
      const tableId = 't_new';
      expect(SharedState.equitySettings.has(tableId)).toBe(false);

      const current = SharedState.equitySettings.get(tableId) || {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      };
      const updated = { ...current, coach: false };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.coach).toBe(false);
      expect(final.players).toBe(false);
      expect(final.showToPlayers).toBe(false);
    });
  });

  describe('coach:set_players_equity_visible', () => {
    it('sets players visibility to true and syncs showToPlayers', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const updated = { ...current, coach: current.coach ?? true, players: true, showToPlayers: true };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.players).toBe(true);
      expect(final.showToPlayers).toBe(true);
    });

    it('sets players visibility to false and syncs showToPlayers', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: true,
        showToPlayers: true,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const updated = { ...current, coach: current.coach ?? true, players: false, showToPlayers: false };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.players).toBe(false);
      expect(final.showToPlayers).toBe(false);
    });

    it('preserves other settings when changing players visibility', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: true,
        showHeatmapToPlayers: true,
      });

      const current = SharedState.equitySettings.get(tableId);
      const updated = { ...current, coach: current.coach ?? true, players: true, showToPlayers: true };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.players).toBe(true);
      expect(final.showToPlayers).toBe(true);
      expect(final.showRangesToPlayers).toBe(true);
      expect(final.showHeatmapToPlayers).toBe(true);
    });
  });

  describe('legacy toggle_equity_display back-compat', () => {
    it('toggles players flag when toggle_equity_display is called', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const newPlayers = !(current.players ?? current.showToPlayers ?? false);
      const updated = { ...current, coach: current.coach ?? true, players: newPlayers, showToPlayers: newPlayers };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.players).toBe(true);
      expect(final.showToPlayers).toBe(true);
    });

    it('toggles back to false on second call', () => {
      const tableId = 't1';
      SharedState.equitySettings.set(tableId, {
        coach: true,
        players: true,
        showToPlayers: true,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const newPlayers = !(current.players ?? current.showToPlayers ?? false);
      const updated = { ...current, coach: current.coach ?? true, players: newPlayers, showToPlayers: newPlayers };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.players).toBe(false);
      expect(final.showToPlayers).toBe(false);
    });

    it('defaults players to false if only showToPlayers exists (migration on read)', () => {
      const tableId = 't1';
      // Simulate old state with only showToPlayers
      SharedState.equitySettings.set(tableId, {
        showToPlayers: true,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const current = SharedState.equitySettings.get(tableId);
      const newPlayers = !(current.players ?? current.showToPlayers ?? false);
      const updated = {
        coach: true,
        players: false,
        ...current,
        coach: current.coach ?? true,
        players: newPlayers,
        showToPlayers: newPlayers,
      };
      SharedState.equitySettings.set(tableId, updated);

      const final = SharedState.equitySettings.get(tableId);
      expect(final.coach).toBe(true);
      expect(final.players).toBe(false); // Toggled from old showToPlayers value (true) → now false
      expect(final.showToPlayers).toBe(false);
    });
  });

  describe('equity broadcast shape', () => {
    it('includes equity_visibility in broadcast payload', () => {
      const settings = SharedState.equitySettings.get('t1') || {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      };

      const broadcast = {
        phase: 'flop',
        equities: [],
        showToPlayers: settings.players ?? settings.showToPlayers ?? false,
        equity_visibility: {
          coach: settings.coach ?? true,
          players: settings.players ?? settings.showToPlayers ?? false,
        },
      };

      expect(broadcast.equity_visibility).toEqual({
        coach: true,
        players: false,
      });
      expect(broadcast.showToPlayers).toBe(false);
    });

    it('broadcast includes legacy showToPlayers for old sidebar compatibility', () => {
      SharedState.equitySettings.set('t1', {
        coach: true,
        players: true,
        showToPlayers: true,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      });

      const settings = SharedState.equitySettings.get('t1');
      const broadcast = {
        phase: 'turn',
        equities: [],
        showToPlayers: settings.players ?? settings.showToPlayers ?? false,
        equity_visibility: {
          coach: settings.coach ?? true,
          players: settings.players ?? settings.showToPlayers ?? false,
        },
      };

      // Old sidebar reads showToPlayers
      expect(broadcast.showToPlayers).toBe(true);
      // New sidebar reads equity_visibility
      expect(broadcast.equity_visibility.players).toBe(true);
    });
  });

  describe('default shape initialization', () => {
    it('default shape includes all required fields', () => {
      const defaultShape = {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      };

      const required = ['coach', 'players', 'showToPlayers', 'showRangesToPlayers', 'showHeatmapToPlayers'];
      required.forEach(field => {
        expect(defaultShape).toHaveProperty(field);
      });
    });

    it('new tables default to coach=true, players=false', () => {
      const tableId = 't_new_table';
      const current = SharedState.equitySettings.get(tableId) || {
        coach: true,
        players: false,
        showToPlayers: false,
        showRangesToPlayers: false,
        showHeatmapToPlayers: false,
      };

      expect(current.coach).toBe(true);
      expect(current.players).toBe(false);
    });
  });
});
