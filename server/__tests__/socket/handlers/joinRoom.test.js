'use strict';

const registerJoinRoom = require('../../../socket/handlers/joinRoom');
const SettingsService = require('../../../services/SettingsService');

// Mock all dependencies
jest.mock('../../../services/SettingsService');
jest.mock('../../../db/repositories/TableRepository', () => ({
  TableRepository: {
    getTable: jest.fn().mockResolvedValue(null),
    createTable: jest.fn().mockResolvedValue(null),
  },
  InvitedPlayersRepository: {
    isInvited: jest.fn().mockResolvedValue(false),
  },
}));
jest.mock('../../../db/HandLoggerSupabase');
jest.mock('../../../game/SessionManager', () => {
  return jest.fn().mockImplementation(() => ({
    state: { players: [] },
    addPlayer: jest.fn(),
  }));
});
jest.mock('../../../state/SharedState', () => ({
  getOrCreateController: jest.fn(),
  getController: jest.fn(),
  tables: new Map(),
  stableIdMap: new Map(),
}));

describe('join_room handler — max_players_per_table enforcement', () => {
  let mockSocket;
  let mockGm;
  let mockIO;
  let ctx;
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock socket
    mockSocket = {
      id: 'socket-123',
      data: {
        authenticated: true,
        isCoach: false,
        stableId: 'player-1',
        isBot: false,
      },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
    };

    // Create mock game manager
    mockGm = {
      state: {
        players: [],
        config: {},
        config_phase: 'table_setup',
      },
      addPlayer: jest.fn().mockReturnValue({ error: null, player: { id: 'socket-123', seat: 0, stack: 1000 } }),
      removePlayer: jest.fn(),
      getPublicState: jest.fn().mockReturnValue({}),
    };

    // Create mock io
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map([['socket-123', mockSocket]]),
      },
    };

    // Mock log
    mockLog = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trackSocket: jest.fn(),
    };

    // Create context
    ctx = {
      tables: new Map([['t1', mockGm]]),
      stableIdMap: new Map(),
      reconnectTimers: new Map(),
      ghostStacks: new Map(),
      io: mockIO,
      broadcastState: jest.fn(),
      sendError: jest.fn((socket, msg) => {
        socket.emit('error', { message: msg });
      }),
      HandLogger: {
        upsertPlayerIdentity: jest.fn().mockResolvedValue(void 0),
      },
      log: mockLog,
    };

    // Mock the tables.get to return mockGm
    ctx.tables.get = jest.fn().mockReturnValue(mockGm);
    ctx.tables.has = jest.fn().mockReturnValue(true);

    // Set up socket.on to capture the handler
    mockSocket.on.mockImplementation((event, handler) => {
      if (event === 'join_room') {
        mockSocket.joinRoomHandler = handler;
      }
    });

    // Register the handler
    registerJoinRoom(mockSocket, ctx);
  });

  describe('max_players_per_table limit enforcement', () => {
    it('should reject join when seated players reach max_players_per_table limit', async () => {
      // Arrange: 9 seated players already at the table
      mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        is_coach: false,
        isCoach: false,
        isSpectator: false,
        name: `Player ${i}`,
        stack: 1000,
      }));

      // Mock org setting to return max_players_per_table = 9
      SettingsService.getOrgSetting.mockResolvedValue({
        max_players_per_table: 9,
      });

      // Act: attempt to join with a 10th player
      await mockSocket.joinRoomHandler({
        name: 'Player10',
        tableId: 't1',
        isSpectator: false,
      });

      // Assert: should emit error
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Table is full',
      }));
      // Should not call addPlayer
      expect(mockGm.addPlayer).not.toHaveBeenCalled();
    });

    it('should allow join when seated players are under limit', async () => {
      // Arrange: 8 seated players already at the table
      mockGm.state.players = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        is_coach: false,
        isCoach: false,
        isSpectator: false,
        name: `Player ${i}`,
        stack: 1000,
      }));

      // Mock org setting to return max_players_per_table = 9
      SettingsService.getOrgSetting.mockResolvedValue({
        max_players_per_table: 9,
      });

      // Act: attempt to join with a 9th player
      await mockSocket.joinRoomHandler({
        name: 'Player9',
        tableId: 't1',
        isSpectator: false,
      });

      // Assert: should NOT emit error about table full
      const errorCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'error' && call[1]?.message === 'Table is full'
      );
      expect(errorCalls).toHaveLength(0);
      // Should call addPlayer
      expect(mockGm.addPlayer).toHaveBeenCalled();
    });

    it('should not count coaches and spectators toward the limit', async () => {
      // Arrange: 1 coach + 1 spectator + 9 seated regular players = 11 total
      // But only 9 count toward the limit
      mockGm.state.players = [
        {
          id: 'coach1',
          is_coach: true,
          isCoach: true,
          isSpectator: false,
          name: 'Coach',
          stack: 0,
        },
        {
          id: 'spec1',
          is_coach: false,
          isCoach: false,
          isSpectator: true,
          name: 'Spectator',
          stack: 0,
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `p${i}`,
          seat: i,
          is_coach: false,
          isCoach: false,
          isSpectator: false,
          name: `Player ${i}`,
          stack: 1000,
        })),
      ];

      // Mock org setting to return max_players_per_table = 9
      SettingsService.getOrgSetting.mockResolvedValue({
        max_players_per_table: 9,
      });

      // Act: attempt to join with another seated player (10th seated)
      await mockSocket.joinRoomHandler({
        name: 'Player10',
        tableId: 't1',
        isSpectator: false,
      });

      // Assert: should reject because 9 seated players already at limit
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Table is full',
      }));
      expect(mockGm.addPlayer).not.toHaveBeenCalled();
    });

    it('should use fallback limit of 9 if org settings not provided', async () => {
      // Arrange: 9 seated players already at the table
      mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        is_coach: false,
        isCoach: false,
        isSpectator: false,
        name: `Player ${i}`,
        stack: 1000,
      }));

      // Mock org setting to return null (not set)
      SettingsService.getOrgSetting.mockResolvedValue(null);

      // Act: attempt to join with a 10th player
      await mockSocket.joinRoomHandler({
        name: 'Player10',
        tableId: 't1',
        isSpectator: false,
      });

      // Assert: should reject with fallback limit of 9
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Table is full',
      }));
      expect(mockGm.addPlayer).not.toHaveBeenCalled();
    });

    it('should allow coaches to join even when table is full of seated players', async () => {
      // Arrange: 9 seated players already at the table (at limit)
      mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        is_coach: false,
        isCoach: false,
        isSpectator: false,
        name: `Player ${i}`,
        stack: 1000,
      }));

      // Mock socket as coach
      mockSocket.data.isCoach = true;

      // Mock org setting to return max_players_per_table = 9
      SettingsService.getOrgSetting.mockResolvedValue({
        max_players_per_table: 9,
      });

      // Act: attempt to join as coach when table is full
      await mockSocket.joinRoomHandler({
        name: 'Coach',
        tableId: 't1',
        isSpectator: false,
      });

      // Assert: should NOT emit "Table is full" error
      const errorCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'error' && call[1]?.message === 'Table is full'
      );
      expect(errorCalls).toHaveLength(0);
      // Should proceed with addPlayer (or other coach-handling logic)
      expect(mockGm.addPlayer).toHaveBeenCalled();
    });

    it('should allow spectators to join even when table is full of seated players', async () => {
      // Arrange: 9 seated players already at the table (at limit)
      mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        is_coach: false,
        isCoach: false,
        isSpectator: false,
        name: `Player ${i}`,
        stack: 1000,
      }));

      // Mock org setting to return max_players_per_table = 9
      SettingsService.getOrgSetting.mockResolvedValue({
        max_players_per_table: 9,
      });

      // Act: attempt to join as spectator when table is full
      await mockSocket.joinRoomHandler({
        name: 'Spectator',
        tableId: 't1',
        isSpectator: true,
      });

      // Assert: should proceed with spectator join (not blocked by seated limit)
      const errorCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'error' && call[1]?.message === 'Table is full'
      );
      expect(errorCalls).toHaveLength(0);
      // Should emit room_joined for spectator
      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', expect.objectContaining({
        isSpectator: true,
      }));
    });
  });
});
