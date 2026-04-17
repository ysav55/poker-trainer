'use strict';

/**
 * Bot table end-to-end socket integration test (POK-58, Phase 2).
 *
 * Spins up the real Express + socket.io server on a random port.
 * Mocks all DB dependencies so no real Supabase calls are made.
 *
 * Flow exercised:
 *   1. Human socket.io-client joins a bot_cash table
 *   2. BotTableController spawns a bot socket (connects to the test server)
 *   3. Once both players are seated, the first hand auto-starts
 *   4. Bot acts automatically via BotDecisionService
 *   5. Hand completes → human receives hand_complete event
 *
 * Assertions:
 *   - hand_complete event received by the human socket
 *   - HandLogger.startHand called (hand logged to DB)
 *   - HandLogger.recordAction called (actions logged)
 *   - HandLogger.endHand called (hand finalized)
 */

// ─── Mock requirePermission (no DB lookups) ───────────────────────────────────
jest.mock('../../auth/requirePermission.js', () => ({
  requirePermission:         () => (_req, _res, next) => next(),
  getPlayerPermissions:      jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));

// ─── Mock HandLoggerSupabase (all DB writes) ──────────────────────────────────
const mockHandLogger = {
  startHand:              jest.fn().mockResolvedValue(undefined),
  recordAction:           jest.fn().mockResolvedValue(undefined),
  recordDeal:             jest.fn().mockResolvedValue(undefined),
  endHand:                jest.fn().mockResolvedValue(undefined),
  markIncomplete:         jest.fn().mockResolvedValue(undefined),
  markLastActionReverted: jest.fn().mockResolvedValue(undefined),
  upsertPlayerIdentity:   jest.fn().mockResolvedValue(undefined),
  ensureSession:          jest.fn().mockResolvedValue(undefined),
  updateCoachTags:        jest.fn().mockResolvedValue(undefined),
  getHands:               jest.fn().mockResolvedValue([]),
  getHandDetail:          jest.fn().mockResolvedValue(null),
  getSessionStats:        jest.fn().mockResolvedValue([]),
  getSessionReport:       jest.fn().mockResolvedValue(null),
  getPlayerStats:         jest.fn().mockResolvedValue(null),
  getAllPlayersWithStats:  jest.fn().mockResolvedValue([]),
  getPlayerHands:         jest.fn().mockResolvedValue([]),
  getPlayerHoverStats:    jest.fn().mockResolvedValue({ allTime: null, session: null }),
  createPlaylist:         jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'test' }),
  getPlaylists:           jest.fn().mockResolvedValue([]),
  getPlaylistHands:       jest.fn().mockResolvedValue([]),
  addHandToPlaylist:      jest.fn().mockResolvedValue({}),
  removeHandFromPlaylist: jest.fn().mockResolvedValue(undefined),
  deletePlaylist:         jest.fn().mockResolvedValue(undefined),
  registerPlayerAccount:  jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
  loginPlayerAccount:     jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
  isRegisteredPlayer:     jest.fn().mockResolvedValue(true),
  loginRosterPlayer:      jest.fn().mockResolvedValue({ stableId: 'test-id', name: 'test' }),
  logStackAdjustment:     jest.fn().mockResolvedValue(undefined),
  analyzeAndTagHand:      jest.fn().mockResolvedValue([]),
};
jest.mock('../HandLoggerSupabase', () => mockHandLogger);

// ─── Mock Supabase admin client ───────────────────────────────────────────────
jest.mock('../supabase', () => {
  const chain = {
    from:        jest.fn(),
    select:      jest.fn(),
    insert:      jest.fn(),
    upsert:      jest.fn(),
    update:      jest.fn(),
    eq:          jest.fn(),
    in:          jest.fn(),
    neq:         jest.fn(),
    order:       jest.fn(),
    limit:       jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single:      jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const k of ['from','select','insert','upsert','update','eq','in','neq','order','limit'])
    chain[k].mockReturnValue(chain);
  return chain;
});

// ─── Mock PlayerRoster ────────────────────────────────────────────────────────
jest.mock('../../auth/PlayerRoster', () => ({
  authenticate: jest.fn().mockResolvedValue(null),
  getRole:      jest.fn().mockReturnValue(null),
  load:         jest.fn(),
  reload:       jest.fn(),
}));

// ─── Mock TableRepository (controls what table type is returned) ──────────────
// The mock.getTable function is configured in beforeAll once we know the port.
const mockGetTable  = jest.fn();
const mockCreateTable = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db/repositories/TableRepository.js', () => ({
  TableRepository: {
    getTable:                 (...args) => mockGetTable(...args),
    createTable:              (...args) => mockCreateTable(...args),
    listTables:               jest.fn().mockResolvedValue([]),
    updateTable:              jest.fn().mockResolvedValue(undefined),
    closeTable:               jest.fn().mockResolvedValue(undefined),
    getTableController:       jest.fn().mockResolvedValue(null),
    activateScheduledTables:  jest.fn().mockResolvedValue([]),
  },
  InvitedPlayersRepository: { isInvited: jest.fn().mockResolvedValue(false) },
  TablePresetsRepository:   { getPresets: jest.fn().mockResolvedValue([]) },
}));

// ─── Mock AnalyzerService (no DB) ────────────────────────────────────────────
jest.mock('../../game/AnalyzerService', () => ({
  buildAnalyzerContext: jest.fn().mockResolvedValue(null),
  analyzeAndTagHand:    jest.fn().mockResolvedValue([]),
}));

// ─── Mock ChipBankRepository ──────────────────────────────────────────────────
jest.mock('../../db/repositories/ChipBankRepository', () => ({
  getBalance: jest.fn().mockResolvedValue(null),
  buyIn:      jest.fn().mockResolvedValue(undefined),
  cashOut:    jest.fn().mockResolvedValue(undefined),
}));

// ─── Module under test ────────────────────────────────────────────────────────
const { httpServer } = require('../../index');
const JwtService     = require('../../auth/JwtService');
const ioc            = require('socket.io-client');

// ─── Constants ────────────────────────────────────────────────────────────────
const TABLE_ID       = 'bot-integration-table';
const HUMAN_STABLE   = 'human-player-stable-id';
const HAND_TIMEOUT   = 15_000; // ms — bots act in 300-800ms, hand should complete well inside 15s

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waitFor(socket, event, timeoutMs = HAND_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for '${event}'`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let serverUrl = '';
let humanSocket;

beforeAll(async () => {
  // Start server on a random OS-assigned port
  await new Promise(resolve => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  serverUrl = `http://localhost:${port}`;

  // Now configure the table mock with the correct serverUrl so BotTableController
  // knows where to connect its bot sockets.
  mockGetTable.mockResolvedValue({
    id:         TABLE_ID,
    name:       'Bot Integration Table',
    mode:       'bot_cash',
    privacy:    'private',
    created_by: HUMAN_STABLE,
    bot_config: {
      difficulty:  'easy',
      bot_count:   1,
      human_seats: 1,
      blinds:      { small: 5, big: 10 },
      serverUrl,        // ← bots connect here
    },
  });
});

afterAll(async () => {
  if (humanSocket?.connected) humanSocket.disconnect();
  // Destroy the BotTableController so its bot sockets disconnect before we close
  // the HTTP server (otherwise httpServer.close() waits indefinitely for them).
  const { destroyController } = require('../../state/SharedState');
  destroyController(TABLE_ID);
  await new Promise(resolve => httpServer.close(resolve));
}, 15_000);

beforeEach(() => jest.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

test('human joins bot table, bots auto-join and complete a hand', async () => {
  // Sign a real JWT for the human — socketAuthMiddleware verifies it
  const humanToken = JwtService.sign({ stableId: HUMAN_STABLE, name: 'Human', role: 'player' });

  humanSocket = ioc(serverUrl, {
    auth:         { token: humanToken },
    reconnection: false,
    forceNew:     true,
  });

  // Wait for human socket to connect
  await waitFor(humanSocket, 'connect', 5000);

  // Human joins the bot table
  humanSocket.emit('join_room', { name: 'Human', tableId: TABLE_ID });

  // Human should receive room_joined
  const roomJoined = await waitFor(humanSocket, 'room_joined', 5000);
  expect(roomJoined.tableId).toBe(TABLE_ID);

  // Human adds a bot (bots are now spawned on demand via bot:add)
  humanSocket.emit('bot:add');

  // Human auto-acts: call/check whenever it is their turn so the hand progresses.
  // The human socket id is only known after connection, so we compare inside the listener.
  const BETTING_PHASES = ['preflop', 'flop', 'turn', 'river'];
  humanSocket.on('game_state', (state) => {
    if (!BETTING_PHASES.includes(state.phase)) return;
    if (state.current_turn !== humanSocket.id) return;
    // Prefer check if available; otherwise call.
    const me = (state.players ?? []).find(p => p.id === humanSocket.id);
    const toCall = Math.max(0, (state.current_bet ?? 0) - (me?.total_bet_this_round ?? 0));
    if (toCall === 0) {
      humanSocket.emit('place_bet', { action: 'check', amount: 0 });
    } else {
      humanSocket.emit('place_bet', { action: 'call', amount: 0 });
    }
  });

  // Wait for hand_complete — bots will auto-act and finish the hand
  const handResult = await waitFor(humanSocket, 'hand_complete', HAND_TIMEOUT);
  expect(handResult).toBeDefined();

  // HandLogger.startHand should have been called once (the hand was logged)
  expect(mockHandLogger.startHand).toHaveBeenCalledTimes(1);
  const startHandArgs = mockHandLogger.startHand.mock.calls[0][0];
  expect(startHandArgs.tableId).toBe(TABLE_ID);
  expect(Array.isArray(startHandArgs.players)).toBe(true);
  // Should have at least 2 players (human + 1 bot)
  expect(startHandArgs.players.length).toBeGreaterThanOrEqual(2);

  // At least one action should have been recorded
  expect(mockHandLogger.recordAction).toHaveBeenCalled();

  // Hand should have been finalized
  expect(mockHandLogger.endHand).toHaveBeenCalledTimes(1);

  // After endHand, analyzeAndTagHand should have been called with the handId
  const AnalyzerService = require('../../game/AnalyzerService');
  expect(AnalyzerService.analyzeAndTagHand).toHaveBeenCalledTimes(1);
  const handId = mockHandLogger.endHand.mock.calls[0][0].handId;
  expect(AnalyzerService.analyzeAndTagHand).toHaveBeenCalledWith(handId);
}, HAND_TIMEOUT + 5000);

test('unauthenticated socket cannot join a bot_cash table', async () => {
  const unauthedSocket = ioc(serverUrl, {
    reconnection: false,
    forceNew:     true,
  });

  try {
    await waitFor(unauthedSocket, 'connect', 5000);
    unauthedSocket.emit('join_room', { name: 'Intruder', tableId: TABLE_ID });
    const err = await waitFor(unauthedSocket, 'error', 3000);
    expect(err.message).toMatch(/authentication required/i);
  } finally {
    unauthedSocket.disconnect();
  }
});

test('non-creator cannot join a private bot_cash table', async () => {
  const otherToken  = JwtService.sign({ stableId: 'other-player-id', name: 'Other', role: 'player' });
  const otherSocket = ioc(serverUrl, {
    auth:         { token: otherToken },
    reconnection: false,
    forceNew:     true,
  });

  try {
    await waitFor(otherSocket, 'connect', 5000);
    otherSocket.emit('join_room', { name: 'Other', tableId: TABLE_ID });
    const err = await waitFor(otherSocket, 'error', 3000);
    expect(err.message).toMatch(/private.*only the creator/i);
  } finally {
    otherSocket.disconnect();
  }
});
