'use strict';

/**
 * joinRoom — bot_cash visibility enforcement tests (Phase 2, POK-58).
 *
 * Uses the same mock-socket strategy as playlists.test.js.
 * Supabase and TableRepository are mocked so no real DB calls happen.
 *
 * Verifies:
 *  - Unauthenticated socket is rejected from bot_cash table
 *  - Unauthenticated stableId (=== socket.id) is rejected from bot_cash table
 *  - privacy=private: creator is allowed, non-creator is rejected
 *  - privacy=school: same-school member is allowed, different-school member is rejected
 *  - privacy=school: creator is always allowed even without a school profile
 *  - Non-bot tables are unaffected (existing coached_cash behaviour preserved)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// supabase — controls player_profiles lookups for school_id checks
const mockSupabase = {
  from:        jest.fn(),
  select:      jest.fn(),
  eq:          jest.fn(),
  maybeSingle: jest.fn(),
};
function _resetSupabase() {
  for (const k of Object.keys(mockSupabase)) mockSupabase[k].mockReset();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
}
jest.mock('../../../db/supabase', () => mockSupabase);

// TableRepository — returns controlled table rows
const mockTableRepo = {
  getTable:    jest.fn(),
  createTable: jest.fn().mockResolvedValue(undefined),
};
const mockInvitedRepo = { isInvited: jest.fn().mockResolvedValue(false) };
jest.mock('../../../db/repositories/TableRepository.js', () => ({
  TableRepository:         mockTableRepo,
  InvitedPlayersRepository: mockInvitedRepo,
}));

// SessionManager — minimal stub so tables.has() works
jest.mock('../../../game/SessionManager', () =>
  jest.fn().mockImplementation(() => ({
    state:           { players: [], phase: 'waiting', replay_mode: { branched: false } },
    addPlayer:       jest.fn().mockReturnValue({}),
    removePlayer:    jest.fn(),
    getPublicState:  jest.fn().mockReturnValue({}),
    getSessionStats: jest.fn().mockReturnValue({}),
  }))
);

// SharedState — getOrCreateController + getController stubs
jest.mock('../../../state/SharedState', () => ({
  getOrCreateController: jest.fn(),
  getController:         jest.fn().mockReturnValue(null),
}));

// ChipBankRepository — stub (chip buy-in path)
jest.mock('../../../db/repositories/ChipBankRepository', () => ({
  getBalance: jest.fn().mockResolvedValue(null),
  buyIn:      jest.fn().mockResolvedValue(undefined),
}));

// SettingsService — returns org settings for max_players_per_table enforcement
jest.mock('../../../services/SettingsService', () => ({
  getOrgSetting: jest.fn().mockResolvedValue(null),
}));

// HandLogger stub
const mockHandLogger = {
  upsertPlayerIdentity: jest.fn().mockResolvedValue(undefined),
};

// Logger stub
const mockLog = {
  info:        jest.fn(),
  warn:        jest.fn(),
  error:       jest.fn(),
  trackSocket: jest.fn(),
};

// ─── Module under test ────────────────────────────────────────────────────────

const registerJoinRoom = require('../joinRoom');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSocket({ stableId = 'user-uuid-1', isCoach = false, authenticated = true, role = null } = {}) {
  const errors = [];
  const emitted = [];
  const handlers = {};
  const socket = {
    id: 'socket-id-1',
    data: { isCoach, stableId, authenticated, role: role ?? (isCoach ? 'coach' : 'player') },
    emit: (event, payload) => emitted.push({ event, payload }),
    on:   (event, handler) => { handlers[event] = handler; },
    join: jest.fn(),
    _emitted: emitted,
    _handlers: handlers,
    _errors:   errors,
  };
  return socket;
}

function makeCtx() {
  const tables = new Map();
  const io = { sockets: { sockets: new Map(), adapter: { rooms: new Map() } } };
  return {
    tables,
    stableIdMap:     new Map(),
    reconnectTimers: new Map(),
    ghostStacks:     new Map(),
    io,
    broadcastState: jest.fn(),
    sendError:      jest.fn((socket, msg) => socket._emitted.push({ event: 'error', payload: { message: msg } })),
    HandLogger:     mockHandLogger,
    log:            mockLog,
  };
}

async function doJoin(socket, ctx, payload = {}) {
  registerJoinRoom(socket, ctx);
  const handler = socket._handlers['join_room'];
  await handler({ name: 'TestUser', tableId: 'bot-table-1', ...payload });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _resetSupabase();
  mockTableRepo.createTable.mockResolvedValue(undefined);
  mockTableRepo.getTable.mockResolvedValue(null); // default: no table row
});

// ─── Unauthenticated / missing stableId ──────────────────────────────────────

test('rejects unauthenticated socket on bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'private', created_by: 'other-user',
  });
  const socket = makeSocket({ authenticated: false });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeDefined();
  expect(err.payload.message).toMatch(/authentication required/i);
});

test('rejects socket whose stableId equals socket.id (no real identity) on bot_cash', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'private', created_by: 'other-user',
  });
  // When stableId is empty the handler falls back to socket.id
  const socket = makeSocket({ stableId: '' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeDefined();
  expect(err.payload.message).toMatch(/authentication required/i);
});

// ─── privacy=private ─────────────────────────────────────────────────────────

test('allows creator to join their own private bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'private', created_by: 'user-uuid-1',
  });
  const socket = makeSocket({ stableId: 'user-uuid-1' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
});

test('rejects non-creator from private bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'private', created_by: 'other-user',
  });
  const socket = makeSocket({ stableId: 'user-uuid-1' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeDefined();
  expect(err.payload.message).toMatch(/private.*only the creator/i);
});

// ─── privacy=school ───────────────────────────────────────────────────────────

test('allows creator to join their own school bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'school', created_by: 'user-uuid-1',
  });
  const socket = makeSocket({ stableId: 'user-uuid-1' });
  const ctx = makeCtx();
  // No supabase call expected when stableId === creatorId
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
  // Supabase profile lookup should NOT have been called (creator bypass)
  expect(mockSupabase.from).not.toHaveBeenCalledWith('player_profiles');
});

test('allows same-school member to join school bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'school', created_by: 'coach-uuid',
  });
  // Both requester and creator share the same school_id
  mockSupabase.maybeSingle
    .mockResolvedValueOnce({ data: { school_id: 'school-abc' }, error: null }) // requester
    .mockResolvedValueOnce({ data: { school_id: 'school-abc' }, error: null }); // creator
  const socket = makeSocket({ stableId: 'student-uuid' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
});

test('rejects different-school member from school bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'school', created_by: 'coach-uuid',
  });
  mockSupabase.maybeSingle
    .mockResolvedValueOnce({ data: { school_id: 'school-xyz' }, error: null }) // requester
    .mockResolvedValueOnce({ data: { school_id: 'school-abc' }, error: null }); // creator
  const socket = makeSocket({ stableId: 'outsider-uuid' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeDefined();
  expect(err.payload.message).toMatch(/only visible to the coach/i);
});

test('rejects requester with no school from school bot_cash table', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'bot-table-1', mode: 'bot_cash', privacy: 'school', created_by: 'coach-uuid',
  });
  mockSupabase.maybeSingle
    .mockResolvedValueOnce({ data: { school_id: null }, error: null }) // requester has no school
    .mockResolvedValueOnce({ data: { school_id: 'school-abc' }, error: null }); // creator
  const socket = makeSocket({ stableId: 'outsider-uuid' });
  const ctx = makeCtx();
  await doJoin(socket, ctx);
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeDefined();
  expect(err.payload.message).toMatch(/only visible to the coach/i);
});

// ─── Non-bot table: existing behaviour unaffected ────────────────────────────

test('coached_cash table join is not affected by bot visibility check', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'coached-table', mode: 'coached_cash', privacy: 'open', created_by: 'someone-else',
  });
  const socket = makeSocket({ stableId: 'user-uuid-1', isCoach: true });
  const ctx = makeCtx();
  await doJoin(socket, ctx, { tableId: 'coached-table' });
  // Should never hit a bot visibility error
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
});

// ─── Admin/superadmin coach privileges in non-coached modes (C-9) ─────────────

test('admin loses isCoach when joining an uncoached_cash table (new behaviour)', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'open-table', mode: 'uncoached_cash', privacy: 'open', created_by: 'someone',
  });
  // socket.data.isCoach is set by socketAuthMiddleware from the JWT; role='admin'
  const socket = makeSocket({ stableId: 'admin-uuid', isCoach: true, role: 'admin' });
  const ctx = makeCtx();
  await doJoin(socket, ctx, { tableId: 'open-table' });
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
  expect(joined.payload.isCoach).toBe(false);
});

test('superadmin loses isCoach when joining an uncoached_cash table (new behaviour)', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'open-table', mode: 'uncoached_cash', privacy: 'open', created_by: 'someone',
  });
  const socket = makeSocket({ stableId: 'sadmin-uuid', isCoach: true, role: 'superadmin' });
  const ctx = makeCtx();
  await doJoin(socket, ctx, { tableId: 'open-table' });
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
  expect(joined.payload.isCoach).toBe(false);
});

test('regular coach loses isCoach in uncoached_cash mode (existing behaviour preserved)', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'open-table', mode: 'uncoached_cash', privacy: 'open', created_by: 'someone',
  });
  const socket = makeSocket({ stableId: 'coach-uuid', isCoach: true, role: 'coach' });
  const ctx = makeCtx();
  await doJoin(socket, ctx, { tableId: 'open-table' });
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
  expect(joined.payload.isCoach).toBe(false);
});

test('admin loses isCoach when joining a tournament mode table (new behaviour)', async () => {
  mockTableRepo.getTable.mockResolvedValue({
    id: 'tourney-table', mode: 'tournament', privacy: 'open', created_by: 'someone',
  });
  const socket = makeSocket({ stableId: 'admin-uuid-2', isCoach: true, role: 'admin' });
  const ctx = makeCtx();
  await doJoin(socket, ctx, { tableId: 'tourney-table' });
  const err = socket._emitted.find(e => e.event === 'error');
  expect(err).toBeUndefined();
  const joined = socket._emitted.find(e => e.event === 'room_joined');
  expect(joined).toBeDefined();
  expect(joined.payload.isCoach).toBe(false);
});
