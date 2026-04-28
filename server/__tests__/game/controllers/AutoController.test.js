'use strict';

const { AutoController } = require('../../../game/controllers/AutoController');

// Mock dependencies
jest.mock('../../../state/SharedState', () => ({
  tables: new Map(),
  stableIdMap: new Map(),
  activeHands: new Map(),
}));

jest.mock('../../../db/HandLoggerSupabase');
jest.mock('../../../game/AnalyzerService');

describe('AutoController', () => {
  let mockGameManager;
  let mockIO;
  let controller;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock GameManager
    mockGameManager = {
      startGame: jest.fn().mockReturnValue({}),
      resetForNextHand: jest.fn(),
      setBlindLevels: jest.fn(),
      adjustStack: jest.fn(),
      state: {
        players: [],
        dealer_seat: 0,
        small_blind: 0.5,
        big_blind: 1,
      },
      getPublicState: jest.fn().mockReturnValue({}),
    };

    // Mock Socket.io
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        adapter: {
          rooms: new Map(),
        },
        sockets: new Map(),
      },
    };
  });

  describe('constructor with table config', () => {
    it('calls setBlindLevels with configured small and big blinds', () => {
      const tableConfig = {
        config: {
          sb: 0.5,
          bb: 1.0,
        },
      };

      controller = new AutoController('table-123', mockGameManager, mockIO, tableConfig);

      expect(mockGameManager.setBlindLevels).toHaveBeenCalledWith(0.5, 1.0);
    });

    it('does not call setBlindLevels if config blinds are missing', () => {
      const tableConfig = {
        config: {
          startingStack: 100,
        },
      };

      controller = new AutoController('table-123', mockGameManager, mockIO, tableConfig);

      expect(mockGameManager.setBlindLevels).not.toHaveBeenCalled();
    });

    it('applies starting stack to already-seated players', () => {
      mockGameManager.state.players = [
        { id: 'player-1', stack: 50, is_coach: false },
        { id: 'player-2', stack: 50, is_coach: false },
      ];

      const tableConfig = {
        config: {
          sb: 0.5,
          bb: 1.0,
          startingStack: 100,
        },
      };

      controller = new AutoController('table-123', mockGameManager, mockIO, tableConfig);

      expect(mockGameManager.adjustStack).toHaveBeenCalledWith('player-1', 50);
      expect(mockGameManager.adjustStack).toHaveBeenCalledWith('player-2', 50);
    });

    it('skips adjusting coach stacks', () => {
      mockGameManager.state.players = [
        { id: 'coach-1', stack: 50, is_coach: true },
        { id: 'player-1', stack: 50, is_coach: false },
      ];

      const tableConfig = {
        config: {
          sb: 0.5,
          bb: 1.0,
          startingStack: 100,
        },
      };

      controller = new AutoController('table-123', mockGameManager, mockIO, tableConfig);

      expect(mockGameManager.adjustStack).not.toHaveBeenCalledWith('coach-1', expect.anything());
      expect(mockGameManager.adjustStack).toHaveBeenCalledWith('player-1', 50);
    });
  });
});
