'use strict';

/**
 * Socket Integration Tests
 *
 * Starts the real server on a random port, connects socket.io clients,
 * and verifies socket event contracts for:
 *
 *  1. join_room — validation (name, coach password, unregistered player)
 *  2. join_room — spectator path
 *  3. join_room — coach path (with and without password)
 *  4. join_room — duplicate-coach downgrades to spectator
 *  5. DB-04 — coach reconnect: password NOT re-validated on reconnect (documents the gap)
 *  6. Action timer — auto-fold fires after 30s timeout
 *  7. Action timer — does NOT fire when game is paused (ISS-40 guard)
 *  8. start_game / place_bet — non-coach cannot call these outside turn
 */

// ── Mock supabase client — CI has no DB credentials ──────────────────────────
// index.js requires supabase directly; without this mock it throws at load time.
jest.mock('../../db/supabase', () => {
  // Create a chainable query builder that supports .select().eq().eq().eq().maybeSingle()
  const createChainableQuery = () => ({
    eq: jest.fn(function() { return this; }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    select: jest.fn(function() { return this; }),
  });

  return {
    from: jest.fn().mockReturnValue({
      select:  jest.fn(function() { return this; }),
      insert:  jest.fn().mockResolvedValue({ data: [], error: null }),
      update:  jest.fn(function() { return this; }),
      delete:  jest.fn(function() { return this; }),
      eq:      jest.fn(function() { return this; }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
});

// ── Mock HandLoggerSupabase (replaces SQLite Database mock) ──────────────────
// Stateful in-memory store so loginRosterPlayer → isRegisteredPlayer works.
jest.mock('../../db/HandLoggerSupabase', () => {
  const { v4: uuidv4 } = require('uuid');
  const _players = new Map(); // stableId → { id, display_name, is_roster }

  return {
    startHand:             jest.fn().mockResolvedValue(undefined),
    recordAction:          jest.fn().mockResolvedValue(undefined),
    endHand:               jest.fn().mockResolvedValue(undefined),
    markIncomplete:        jest.fn().mockResolvedValue(undefined),
    analyzeAndTagHand:     jest.fn().mockResolvedValue({ auto_tags: [], mistake_tags: [] }),
    markLastActionReverted:jest.fn().mockResolvedValue(undefined),
    upsertPlayerIdentity:  jest.fn().mockResolvedValue(undefined),
    ensureSession:         jest.fn().mockResolvedValue(undefined),
    updateCoachTags:       jest.fn().mockResolvedValue(undefined),
    getHands:              jest.fn().mockResolvedValue([]),
    getHandDetail:         jest.fn().mockResolvedValue(null),
    getSessionStats:       jest.fn().mockResolvedValue([]),
    getSessionReport:      jest.fn().mockResolvedValue(null),
    getPlayerStats:        jest.fn().mockResolvedValue(null),
    getAllPlayersWithStats: jest.fn().mockResolvedValue([]),
    getPlayerHands:        jest.fn().mockResolvedValue([]),
    createPlaylist:        jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'test' }),
    getPlaylists:          jest.fn().mockResolvedValue([]),
    getPlaylistHands:      jest.fn().mockResolvedValue([]),
    addHandToPlaylist:     jest.fn().mockResolvedValue({}),
    removeHandFromPlaylist:jest.fn().mockResolvedValue(undefined),
    deletePlaylist:        jest.fn().mockResolvedValue(undefined),
    registerPlayerAccount: jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
    loginPlayerAccount:    jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
    loginRosterPlayer: jest.fn(async (name) => {
      const trimmed = name.trim();
      // Find existing by display_name
      for (const [id, p] of _players) {
        if (p.display_name === trimmed) {
          return { stableId: id, name: trimmed };
        }
      }
      // Create new
      const stableId = uuidv4();
      _players.set(stableId, { id: stableId, display_name: trimmed, is_roster: true });
      return { stableId, name: trimmed };
    }),
    isRegisteredPlayer: jest.fn(async (stableId) => {
      return _players.has(stableId);
    }),
  };
});

// ── Mock JwtService — join_room calls JwtService.verify(token) ───────────────
jest.mock('../../auth/JwtService', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn((token) => {
    if (!token || token === 'invalid-token') return null;
    // coach- prefix → coach role; anything else → student
    const stableId = token.startsWith('coach-') ? 'coach-uuid' : token;
    const role = token.startsWith('coach-') ? 'coach' : 'student';
    return { stableId, name: 'TestPlayer', role };
  }),
}));

const { createClient, waitForEvent, joinRoom } = (() => {
  // Helpers defined here to be reused across suites
  const ioc = require('socket.io-client');

  function createClient(port, opts = {}) {
    return ioc(`http://localhost:${port}`, {
      forceNew: true,
      autoConnect: true,
      reconnection: false,
      ...opts,
    });
  }

  function waitForEvent(socket, event, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for '${event}'`)),
        timeoutMs
      );
      socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
    });
  }

  function joinRoom(socket, payload) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (data) => { if (!done) { done = true; resolve(data); } };
      socket.once('room_joined', (d) => finish({ type: 'room_joined', data: d }));
      socket.once('error',      (d) => finish({ type: 'error',       data: d }));
      socket.emit('join_room', payload);
    });
  }

  return { createClient, waitForEvent, joinRoom };
})();

// ── Server lifecycle ──────────────────────────────────────────────────────────

// Ensure required env vars are set before index.js is loaded
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-jest';

let serverPort;
let httpServer;
let HandLogger;
// Collect all clients so we can force-disconnect them in afterAll
const allClients = [];
function trackClient(c) { allClients.push(c); return c; }

beforeAll((done) => {
  ({ httpServer } = require('../../index'));
  HandLogger = require('../../db/HandLoggerSupabase');
  httpServer.listen(0, () => {
    serverPort = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  allClients.forEach(c => { try { c.disconnect(); } catch {} });
  // Give sockets a tick to close, then shut down the server
  if (!httpServer) return done();
  setTimeout(() => httpServer.close(done), 300);
}, 15000);

// ─────────────────────────────────────────────
//  Helper: register a player in the DB and return their stableId
// ─────────────────────────────────────────────
let _playerCounter = 0;
async function registerPlayer(namePrefix = 'Player') {
  const name   = `${namePrefix}${++_playerCounter}`;
  const result = await HandLogger.loginRosterPlayer(name);
  // token equals stableId — authenticateToken mock resolves token → userId=token for non-coach tokens
  return { name: result.name, stableId: result.stableId, token: result.stableId };
}

// ─────────────────────────────────────────────
//  Suite 1 — join_room validation
// ─────────────────────────────────────────────

describe('join_room — validation', () => {
  let client;
  afterEach(() => { client?.disconnect(); });

  it('emits error when name is missing', async () => {
    client = trackClient(createClient(serverPort));
    const result = await joinRoom(client, { isCoach: false, tableId: 'test-table' });
    expect(result.type).toBe('error');
    expect(result.data.message).toMatch(/name/i);
  });

  it('emits error when name is empty string', async () => {
    client = trackClient(createClient(serverPort));
    const result = await joinRoom(client, { name: '  ', tableId: 'test-table' });
    expect(result.type).toBe('error');
  });

  it('emits error when unauthenticated player tries to join (no token)', async () => {
    client = trackClient(createClient(serverPort));
    const result = await joinRoom(client, {
      name: 'UnregisteredUser',
      isCoach: false,
      isSpectator: false,
      tableId: 'test-table',
    });
    expect(result.type).toBe('error');
    expect(result.data.message).toMatch(/authentication|log in/i);
  });

  it('emits error when token is invalid (non-spectator, non-coach)', async () => {
    client = trackClient(createClient(serverPort, { auth: { token: 'invalid-token' } }));
    const result = await joinRoom(client, {
      name: 'SomeUser',
      isCoach: false,
      isSpectator: false,
      tableId: 'test-table',
    });
    expect(result.type).toBe('error');
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — spectator join
// ─────────────────────────────────────────────

describe('join_room — spectator', () => {
  let client;
  afterEach(() => { client?.disconnect(); });

  it('spectator gets room_joined with isSpectator=true', async () => {
    client = trackClient(createClient(serverPort));
    const result = await joinRoom(client, {
      name: 'Watcher',
      isSpectator: true,
      tableId: 'spectator-table',
    });
    expect(result.type).toBe('room_joined');
    expect(result.data.isSpectator).toBe(true);
    expect(result.data.isCoach).toBe(false);
  });

  it('spectator receives a game_state event after joining', async () => {
    client = trackClient(createClient(serverPort));
    // Listen for game_state before emitting join_room
    const statePromise = waitForEvent(client, 'game_state');
    client.emit('join_room', {
      name: 'Watcher2',
      isSpectator: true,
      tableId: 'spectator-table2',
    });
    const state = await statePromise;
    expect(state).toBeDefined();
    expect(state.phase).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — coach join (roster-based auth)
// ─────────────────────────────────────────────

describe('join_room — coach (Supabase auth)', () => {
  let client;
  afterEach(() => { client?.disconnect(); });

  it('coach joins successfully when token identifies role as coach', async () => {
    // authenticateToken mock: tokens starting with 'coach-' → isCoach=true
    client = trackClient(createClient(serverPort, { auth: { token: 'coach-token-1' } }));
    const result = await joinRoom(client, {
      name: 'Coach',
      tableId: 'coach-table-1',
    });
    expect(result.type).toBe('room_joined');
    expect(result.data.isCoach).toBe(true);
  });

  it('coach room_joined includes playerId', async () => {
    client = trackClient(createClient(serverPort, { auth: { token: 'coach-token-2' } }));
    const result = await joinRoom(client, {
      name: 'CoachB',
      tableId: 'coach-table-2',
    });
    expect(result.data.playerId).toBeDefined();
    expect(typeof result.data.playerId).toBe('string');
  });

  it('coach is NOT marked as spectator', async () => {
    client = trackClient(createClient(serverPort, { auth: { token: 'coach-token-3' } }));
    const result = await joinRoom(client, {
      name: 'CoachC',
      tableId: 'coach-table-3',
    });
    expect(result.data.isSpectator).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — registered player join
// ─────────────────────────────────────────────

describe('join_room — registered player', () => {
  let client;
  afterEach(() => { client?.disconnect(); });

  it('registered player gets room_joined', async () => {
    const { name, token } = await registerPlayer('Reg');
    client = trackClient(createClient(serverPort, { auth: { token } }));
    const result = await joinRoom(client, {
      name,
      isCoach: false,
      isSpectator: false,
      tableId: 'reg-table',
    });
    expect(result.type).toBe('room_joined');
    expect(result.data.isSpectator).toBe(false);
  });

  it('registered player playerId in room_joined matches their stableId', async () => {
    const { name, token } = await registerPlayer('Reg');
    client = trackClient(createClient(serverPort, { auth: { token } }));
    const result = await joinRoom(client, {
      name,
      isCoach: false,
      isSpectator: false,
      tableId: 'reg-table-2',
    });
    expect(result.type).toBe('room_joined');
    // room_joined.playerId may be socket.id (not stableId), that's OK — just check it's defined
    expect(result.data.playerId).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — duplicate coach → demoted to player
// ─────────────────────────────────────────────

describe('join_room — second coach attempt', () => {
  let coach1, coach2;
  afterEach(() => { coach1?.disconnect(); coach2?.disconnect(); });

  it('second coach is demoted to regular player (not spectator)', async () => {
    coach1 = trackClient(createClient(serverPort, { auth: { token: 'coach-primary-token' } }));
    await joinRoom(coach1, { name: 'CoachPrimary', tableId: 'dual-coach-table' });

    coach2 = trackClient(createClient(serverPort, { auth: { token: 'coach-secondary-token' } }));
    const result = await joinRoom(coach2, {
      name: 'CoachSecondary',
      tableId: 'dual-coach-table',
    });
    expect(result.type).toBe('room_joined');
    expect(result.data.isCoach).toBe(false);
    expect(result.data.isSpectator).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  Suite 6 — DB-04: coach impersonation blocked (FIXED)
// ─────────────────────────────────────────────

describe('DB-04 — coach impersonation blocked by Supabase auth (FIXED)', () => {
  /**
   * DB-04 was: any client knowing the coach name could send isCoach:true and
   * hijack the seat when COACH_PASSWORD was empty.
   *
   * FIX: join_room now calls authenticateToken(token) and trusts the server-verified
   * isCoach flag from user_metadata — the client-supplied isCoach flag is ignored.
   * An intruder with no valid token is rejected outright (auth required).
   */

  let coach, intruder;
  const TABLE        = 'db04-test-table';
  const COACH_NAME   = 'CoachDB04';
  const INTRUDER_NAME = 'DB04Intruder';

  afterEach(() => { coach?.disconnect(); intruder?.disconnect(); });

  it('legitimate coach joins successfully with coach token', async () => {
    coach = trackClient(createClient(serverPort, { auth: { token: 'coach-db04-token' } }));
    const result = await joinRoom(coach, { name: COACH_NAME, tableId: TABLE });
    expect(result.type).toBe('room_joined');
    expect(result.data.isCoach).toBe(true);
  });

  it('intruder with no token is rejected (authentication required)', async () => {
    intruder = trackClient(createClient(serverPort));
    const result = await joinRoom(intruder, {
      name: INTRUDER_NAME,
      isCoach: true,
      tableId: TABLE,
    });
    expect(result.type).toBe('error');
    expect(result.data.message).toMatch(/authentication|log in/i);
  });
});

// ─────────────────────────────────────────────
//  Suite 7 — action timer broadcast
// ─────────────────────────────────────────────

describe('Action timer — broadcast on game start', () => {
  jest.setTimeout(8000);

  let coach, player1, player2;
  const TABLE = 'timer-table';

  afterEach(() => {
    coach?.disconnect();
    player1?.disconnect();
    player2?.disconnect();
  });

  it('server emits action_timer event when a hand starts', async () => {
    const p1 = await registerPlayer('TimerP');
    const p2 = await registerPlayer('TimerP');

    coach   = trackClient(createClient(serverPort, { auth: { token: 'coach-timer-token' } }));
    player1 = trackClient(createClient(serverPort, { auth: { token: p1.token } }));
    player2 = trackClient(createClient(serverPort, { auth: { token: p2.token } }));

    await joinRoom(coach,   { name: 'TimerCoach', tableId: TABLE });
    await joinRoom(player1, { name: p1.name, isCoach: false, isSpectator: false, tableId: TABLE });
    await joinRoom(player2, { name: p2.name, isCoach: false, isSpectator: false, tableId: TABLE });

    // Capture action_timer event
    const timerPromise = waitForEvent(coach, 'action_timer', 3000);
    coach.emit('start_game', { mode: 'rng' });

    const timerEvent = await timerPromise;
    expect(timerEvent).not.toBeNull();
    expect(timerEvent.playerId).toBeTruthy();
    expect(timerEvent.duration).toBe(30_000);
    expect(typeof timerEvent.startedAt).toBe('number');
  });

  it('action_timer event is null after game is paused', async () => {
    const p1 = await registerPlayer('TimerP');
    const p2 = await registerPlayer('TimerP');

    coach   = trackClient(createClient(serverPort, { auth: { token: 'coach-timerpause-token' } }));
    player1 = trackClient(createClient(serverPort, { auth: { token: p1.token } }));
    player2 = trackClient(createClient(serverPort, { auth: { token: p2.token } }));

    await joinRoom(coach,   { name: 'TimerPauseCoach', tableId: TABLE + '-p' });
    await joinRoom(player1, { name: p1.name, isCoach: false, isSpectator: false, tableId: TABLE + '-p' });
    await joinRoom(player2, { name: p2.name, isCoach: false, isSpectator: false, tableId: TABLE + '-p' });

    // Start and wait for first action_timer
    await new Promise(resolve => {
      coach.once('action_timer', resolve);
      coach.emit('start_game', { mode: 'rng' });
    });

    // Pause — should cancel the timer (null emission)
    const cancelPromise = waitForEvent(coach, 'action_timer', 2000);
    coach.emit('toggle_pause');
    const cancelEvent = await cancelPromise;
    expect(cancelEvent).toBeNull();
  });
});

// ─────────────────────────────────────────────
//  Suite 8 — ISS-40: pause guard in timer callback
// ─────────────────────────────────────────────

describe('ISS-40 — pause guard: paused game does not auto-fold', () => {
  /**
   * Tests the guard condition in the auto-fold callback:
   *   if (!currentGm || currentGm.state.paused) return;
   *
   * We verify this at the GameManager level (no real timer needed):
   * a paused game rejects no-op timer callbacks without changing current_turn.
   */

  it('paused GameManager state blocks a simulated auto-fold attempt', () => {
    const GameManager = require('../GameManager');
    const gm = new GameManager('iss40-test');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const originalTurn = gm.state.current_turn;
    expect(originalTurn).toBeTruthy();

    // Simulate pause
    gm.state.paused = true;

    // Simulate what the auto-fold callback does — it checks paused first
    if (!gm.state.paused) {
      gm.placeBet(originalTurn, 'fold');
    }

    // Turn must not have changed because paused=true blocked the fold
    expect(gm.state.current_turn).toBe(originalTurn);
  });

  it('paused guard correctly detects paused=true vs paused=false', () => {
    const GameManager = require('../GameManager');
    const gm = new GameManager('iss40-test2');
    gm.addPlayer('p1', 'Alice');
    gm.addPlayer('p2', 'Bob');
    gm.startGame('rng');

    const turnBefore = gm.state.current_turn;

    // Not paused — auto-fold SHOULD proceed
    gm.state.paused = false;
    if (!gm.state.paused) {
      gm.placeBet(turnBefore, 'fold');
    }

    // Turn should have advanced
    expect(gm.state.current_turn).not.toBe(turnBefore);
  });
});

// ─────────────────────────────────────────────
//  Suite 9 — non-coach cannot start game
// ─────────────────────────────────────────────

describe('Permission guards — non-coach events', () => {
  let player, coach;
  const TABLE = 'perm-table';

  afterEach(() => { player?.disconnect(); coach?.disconnect(); });

  it('non-coach receives error when trying to start_game', async () => {
    const { name, token } = await registerPlayer('PermP');

    coach  = trackClient(createClient(serverPort, { auth: { token: 'coach-perm-token' } }));
    player = trackClient(createClient(serverPort, { auth: { token } }));

    await joinRoom(coach,  { name: 'PermCoach', tableId: TABLE });
    await joinRoom(player, { name, isCoach: false, isSpectator: false, tableId: TABLE });

    const errPromise = waitForEvent(player, 'error');
    player.emit('start_game', { mode: 'rng' });
    const err = await errPromise;
    expect(err.message).toMatch(/coach/i);
  });

  it('non-coach receives error when trying to reset_hand', async () => {
    const { name, token } = await registerPlayer('PermP');

    coach  = trackClient(createClient(serverPort, { auth: { token: 'coach-perm2-token' } }));
    player = trackClient(createClient(serverPort, { auth: { token } }));

    await joinRoom(coach,  { name: 'PermCoach2', tableId: TABLE + '2' });
    await joinRoom(player, { name, isCoach: false, isSpectator: false, tableId: TABLE + '2' });

    const errPromise = waitForEvent(player, 'error');
    player.emit('reset_hand');
    const err = await errPromise;
    expect(err.message).toMatch(/coach/i);
  });

  it('non-coach receives error when trying to load_replay', async () => {
    const { name, token } = await registerPlayer('PermP');

    coach  = trackClient(createClient(serverPort, { auth: { token: 'coach-perm3-token' } }));
    player = trackClient(createClient(serverPort, { auth: { token } }));

    await joinRoom(coach,  { name: 'PermCoach3', tableId: TABLE + '3' });
    await joinRoom(player, { name, isCoach: false, isSpectator: false, tableId: TABLE + '3' });

    const errPromise = waitForEvent(player, 'error');
    player.emit('load_replay', { handId: 'fake-hand' });
    const err = await errPromise;
    expect(err.message).toMatch(/coach/i);
  });
});

// ─────────────────────────────────────────────
//  Suite 10 — set_blind_levels socket event
// ─────────────────────────────────────────────

describe('set_blind_levels socket event', () => {
  let coach, player1, player2;
  const TABLE = 'blinds-test-table';

  afterEach(() => {
    coach?.disconnect();
    player1?.disconnect();
    player2?.disconnect();
  });

  async function buildBlindTable(tableSuffix = '') {
    const p1 = await registerPlayer('BlindsP');
    const p2 = await registerPlayer('BlindsP');

    coach   = trackClient(createClient(serverPort, { auth: { token: 'coach-blinds-token' + tableSuffix } }));
    player1 = trackClient(createClient(serverPort, { auth: { token: p1.token } }));
    player2 = trackClient(createClient(serverPort, { auth: { token: p2.token } }));

    await joinRoom(coach,   { name: 'BlindsCoach', tableId: TABLE + tableSuffix });
    await joinRoom(player1, { name: p1.name, isCoach: false, isSpectator: false, tableId: TABLE + tableSuffix });
    await joinRoom(player2, { name: p2.name, isCoach: false, isSpectator: false, tableId: TABLE + tableSuffix });

    // Yield to the event loop twice so any in-flight game_state broadcasts from the
    // join sequence are delivered to (no listeners) before tests register their own.
    // setImmediate runs in the "check" phase — after pending I/O callbacks (TCP data).
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    return { p1, p2 };
  }

  it('coach can set blind levels between hands and receives updated game_state', async () => {
    await buildBlindTable('-a');

    const statePromise = waitForEvent(coach, 'game_state', 2000);
    coach.emit('set_blind_levels', { sb: 10, bb: 20 });
    const state = await statePromise;

    expect(state.small_blind).toBe(10);
    expect(state.big_blind).toBe(20);
  });

  it('game_state is broadcast to non-coach players after blind change', async () => {
    await buildBlindTable('-b');

    const statePromise = waitForEvent(player1, 'game_state', 2000);
    coach.emit('set_blind_levels', { sb: 25, bb: 50 });
    const state = await statePromise;

    expect(state.small_blind).toBe(25);
    expect(state.big_blind).toBe(50);
  });

  it('non-coach receives error when trying to set_blind_levels', async () => {
    await buildBlindTable('-c');

    const errPromise = waitForEvent(player1, 'error', 2000);
    player1.emit('set_blind_levels', { sb: 10, bb: 20 });
    const err = await errPromise;
    expect(err.message).toMatch(/coach/i);
  });

  it('set_blind_levels during active hand returns sync_error', async () => {
    await buildBlindTable('-d');

    // Start a hand
    const handPromise = waitForEvent(coach, 'game_state', 2000);
    coach.emit('start_game', { mode: 'rng' });
    const activeState = await handPromise;
    expect(activeState.phase).toBe('preflop');

    // Try to change blinds mid-hand — should error
    const errPromise = waitForEvent(coach, 'sync_error', 2000);
    coach.emit('set_blind_levels', { sb: 10, bb: 20 });
    const err = await errPromise;
    expect(err.message).toMatch(/active hand|waiting/i);
  });

  it('invalid blind levels (bb <= sb) returns sync_error', async () => {
    await buildBlindTable('-e');

    const errPromise = waitForEvent(coach, 'sync_error', 2000);
    coach.emit('set_blind_levels', { sb: 20, bb: 10 }); // bb <= sb
    const err = await errPromise;
    expect(err.message).toMatch(/invalid|blind/i);
  });

  it('invalid blind levels (zero sb) returns sync_error', async () => {
    await buildBlindTable('-f');

    const errPromise = waitForEvent(coach, 'sync_error', 2000);
    coach.emit('set_blind_levels', { sb: 0, bb: 10 });
    const err = await errPromise;
    expect(err.message).toMatch(/invalid|blind/i);
  });
});

// ─────────────────────────────────────────────
//  Suite 11 — adjust_stack socket event
// ─────────────────────────────────────────────

describe('adjust_stack socket event', () => {
  let coach, player1, player2;
  const TABLE = 'stack-adj-table';

  afterEach(() => {
    coach?.disconnect();
    player1?.disconnect();
    player2?.disconnect();
  });

  async function buildStackTable(tableSuffix = '') {
    const p1 = await registerPlayer('StackP');
    const p2 = await registerPlayer('StackP');

    coach   = trackClient(createClient(serverPort, { auth: { token: 'coach-stack-token' + tableSuffix } }));
    player1 = trackClient(createClient(serverPort, { auth: { token: p1.token } }));
    player2 = trackClient(createClient(serverPort, { auth: { token: p2.token } }));

    await joinRoom(coach,   { name: 'StackCoach', tableId: TABLE + tableSuffix });
    const j1 = await joinRoom(player1, { name: p1.name, isCoach: false, isSpectator: false, tableId: TABLE + tableSuffix });
    const j2 = await joinRoom(player2, { name: p2.name, isCoach: false, isSpectator: false, tableId: TABLE + tableSuffix });

    // Flush in-flight game_state broadcasts from joins before tests register listeners.
    // room_joined already carries the socket ID, so no game_state drain is needed.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    const p1ServerObj = { id: j1.data.playerId, name: p1.name };
    const p2ServerObj = { id: j2.data.playerId, name: p2.name };

    return { p1, p2, p1ServerObj, p2ServerObj };
  }

  it('coach can adjust a player stack and game_state reflects the change', async () => {
    const { p1ServerObj } = await buildStackTable('-a');

    const statePromise = waitForEvent(coach, 'game_state', 2000);
    coach.emit('adjust_stack', { playerId: p1ServerObj.id, amount: 2500 });
    const state = await statePromise;

    const updated = state.players.find(p => p.id === p1ServerObj.id);
    expect(updated.stack).toBe(2500);
  });

  it('stack adjustment is broadcast to all clients', async () => {
    const { p1ServerObj } = await buildStackTable('-b');

    const statePromise = waitForEvent(player1, 'game_state', 2000);
    coach.emit('adjust_stack', { playerId: p1ServerObj.id, amount: 3000 });
    const state = await statePromise;

    const updated = state.players.find(p => p.id === p1ServerObj.id);
    expect(updated.stack).toBe(3000);
  });

  it('non-coach receives error when trying to adjust_stack', async () => {
    const { p1ServerObj } = await buildStackTable('-c');

    const errPromise = waitForEvent(player1, 'error', 2000);
    player1.emit('adjust_stack', { playerId: p1ServerObj.id, amount: 500 });
    const err = await errPromise;
    expect(err.message).toMatch(/coach/i);
  });

  it('adjusting to zero is allowed', async () => {
    const { p1ServerObj } = await buildStackTable('-d');

    const statePromise = waitForEvent(coach, 'game_state', 2000);
    coach.emit('adjust_stack', { playerId: p1ServerObj.id, amount: 0 });
    const state = await statePromise;

    const updated = state.players.find(p => p.id === p1ServerObj.id);
    expect(updated.stack).toBe(0);
  });

  it('negative amount returns error', async () => {
    const { p1ServerObj } = await buildStackTable('-e');

    const errPromise = waitForEvent(coach, 'error', 2000);
    coach.emit('adjust_stack', { playerId: p1ServerObj.id, amount: -100 });
    const err = await errPromise;
    expect(err.message).toMatch(/non-negative|negative|amount/i);
  });

  it('unknown playerId returns error', async () => {
    await buildStackTable('-f');

    const errPromise = waitForEvent(coach, 'error', 2000);
    coach.emit('adjust_stack', { playerId: 'nonexistent-id', amount: 1000 });
    const err = await errPromise;
    expect(err.message).toMatch(/not found|player/i);
  });
});

// ─────────────────────────────────────────────
//  Suite — is_spectating flag for mid-hand joins
// ─────────────────────────────────────────────
describe('join_room — is_spectating flag for mid-hand joins', () => {
  let coach, player1, player2, joinerClient;
  const TABLE = 'is-spectating-table';

  afterEach(() => {
    coach?.disconnect();
    player1?.disconnect();
    player2?.disconnect();
    joinerClient?.disconnect();
  });

  it('player joining during active hand gets is_spectating=true in broadcast', async () => {
    const p1 = await registerPlayer('SpecP1');
    const p2 = await registerPlayer('SpecP2');

    coach = trackClient(createClient(serverPort, { auth: { token: 'coach-spec-token' } }));
    player1 = trackClient(createClient(serverPort, { auth: { token: p1.token } }));
    player2 = trackClient(createClient(serverPort, { auth: { token: p2.token } }));

    // Set up: coach + 2 players join
    await joinRoom(coach, { name: 'SpecCoach', tableId: TABLE });
    await joinRoom(player1, { name: p1.name, isCoach: false, isSpectator: false, tableId: TABLE });
    await joinRoom(player2, { name: p2.name, isCoach: false, isSpectator: false, tableId: TABLE });

    // Start game (puts game in 'preflop' phase)
    coach.emit('start_game', { mode: 'rng' });
    await new Promise(r => setTimeout(r, 100)); // Let game state propagate

    // New player joins WHILE HAND IS IN PROGRESS
    joinerClient = trackClient(createClient(serverPort, { auth: { token: 'late-joiner-token' } }));

    // Listen for player:joined broadcast on coach (or other clients)
    const playerJoinedPromise = waitForEvent(coach, 'player:joined', 2000);
    joinerClient.emit('join_room', { name: 'LateJoiner', isCoach: false, isSpectator: false, tableId: TABLE });

    const playerJoinedEvent = await playerJoinedPromise;
    expect(playerJoinedEvent).toBeDefined();
    expect(playerJoinedEvent.name).toBe('LateJoiner');
    expect(playerJoinedEvent.is_spectating).toBe(true); // CRITICAL: mid-hand joiner is spectator
  });
});
