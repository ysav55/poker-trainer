'use strict';

/**
 * Phase 3 Tournament Visibility Filtering — Standalone Tournament Routes Tests
 *
 * Tests for:
 * - Gap 2: POST /api/tournaments — non-admin 'open' rejection
 * - Gap 3: POST /api/tournaments — privateConfig parameter acceptance
 * - Gap 4: POST /api/tournaments — whitelist population
 * - Gap 5: PATCH /api/tournaments/:id/privacy — owner authorization
 * - Gap 6: PATCH /api/tournaments/:id/privacy — whitelist management
 * - Gap 7: POST /api/tournaments/:id/whitelist — authorization checks
 * - Gap 8: DELETE /api/tournaments/:id/whitelist/:playerId — authorization
 * - Gap 9: GET /api/tournaments/:id — visibility check (403 for non-visible)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockCurrentUser = { id: 'coach-uuid', stableId: 'coach-uuid', role: 'coach', school_id: 'school-1' };

jest.mock('../auth/requireAuth.js', () =>
  jest.fn((req, _res, next) => { req.user = mockCurrentUser; next(); })
);

jest.mock('../auth/requireRole.js', () => {
  return (role) => (req, res, next) => {
    if (mockCurrentUser.role === role || (role === 'coach' && ['coach', 'admin', 'superadmin'].includes(mockCurrentUser.role))) {
      next();
    } else {
      res.status(403).json({ error: 'forbidden' });
    }
  };
});

const mockCreateTournament = jest.fn().mockResolvedValue('tournament-uuid-1');
const mockListTournaments = jest.fn().mockResolvedValue([]);
const mockGetTournamentById = jest.fn().mockResolvedValue(null);
const mockCanPlayerSeeTournament = jest.fn().mockResolvedValue(true);
const mockAddToWhitelist = jest.fn().mockResolvedValue(undefined);
const mockRemoveFromWhitelist = jest.fn().mockResolvedValue({ removed: true, count: 1 });
const mockAddGroupToWhitelist = jest.fn().mockResolvedValue(3);
const mockUpdatePrivacy = jest.fn().mockResolvedValue({ id: 'tournament-1', privacy: 'private' });
const mockGetWhitelist = jest.fn().mockResolvedValue([]);

jest.mock('../db/repositories/TournamentRepository.js', () => ({
  TournamentRepository: {
    createTournament: (...a) => mockCreateTournament(...a),
    listTournaments: (...a) => mockListTournaments(...a),
    getTournamentById: (...a) => mockGetTournamentById(...a),
    canPlayerSeeTournament: (...a) => mockCanPlayerSeeTournament(...a),
    addToWhitelist: (...a) => mockAddToWhitelist(...a),
    removeFromWhitelist: (...a) => mockRemoveFromWhitelist(...a),
    addGroupToWhitelist: (...a) => mockAddGroupToWhitelist(...a),
    updatePrivacy: (...a) => mockUpdatePrivacy(...a),
    getWhitelist: (...a) => mockGetWhitelist(...a),
    updateTournamentStatus: jest.fn().mockResolvedValue(undefined),
    registerPlayer: jest.fn().mockResolvedValue({}),
    getTournamentStandings: jest.fn().mockResolvedValue([]),
    updatePlayerStanding: jest.fn().mockResolvedValue(undefined),
    advanceLevel: jest.fn().mockResolvedValue(0),
  },
}));

// ─── App setup ────────────────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');
const registerTournamentStandaloneRoutes = require('../routes/tournaments');

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = require('../auth/requireAuth');
  const requireRole = require('../auth/requireRole');
  registerTournamentStandaloneRoutes(app, { requireAuth, requireRole });
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { id: 'coach-uuid', stableId: 'coach-uuid', role: 'coach', school_id: 'school-1' };
  mockCreateTournament.mockResolvedValue('tournament-uuid-1');
  mockListTournaments.mockResolvedValue([]);
  mockGetTournamentById.mockResolvedValue(null);
  mockCanPlayerSeeTournament.mockResolvedValue(true);
  mockAddToWhitelist.mockResolvedValue(undefined);
  mockRemoveFromWhitelist.mockResolvedValue({ removed: true, count: 1 });
  mockAddGroupToWhitelist.mockResolvedValue(3);
  mockUpdatePrivacy.mockResolvedValue({ id: 'tournament-1', privacy: 'private' });
  mockGetWhitelist.mockResolvedValue([]);
});

// ─── Gap 2: POST /api/tournaments — Non-admin 'open' rejection ────────────────

describe('POST /api/tournaments — privacy validation', () => {
  test('coach cannot create open tournament (400)', async () => {
    const app = buildApp();
    mockCurrentUser.role = 'coach';

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Open Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'open',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('forbidden_privacy');
    expect(res.body.message).toContain('Only admins can create open tournaments');
    expect(mockCreateTournament).not.toHaveBeenCalled();
  });

  test('admin can create open tournament', async () => {
    const app = buildApp();
    mockCurrentUser.role = 'admin';

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Open Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'open',
      });

    expect(res.status).toBe(201);
    expect(mockCreateTournament).toHaveBeenCalledWith(expect.objectContaining({ privacy: 'open' }));
  });

  test('coach can create school tournament', async () => {
    const app = buildApp();
    mockCurrentUser.role = 'coach';

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'School Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'school',
      });

    expect(res.status).toBe(201);
    expect(mockCreateTournament).toHaveBeenCalled();
  });

  test('coach can create private tournament', async () => {
    const app = buildApp();
    mockCurrentUser.role = 'coach';

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Private Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'private',
        privateConfig: {
          whitelistedPlayers: ['player-uuid-1', 'player-uuid-2'],
          groupId: null,
        },
      });

    expect(res.status).toBe(201);
    expect(mockCreateTournament).toHaveBeenCalled();
  });
});

// ─── Gap 3: POST /api/tournaments — privateConfig validation ──────────────────

describe('POST /api/tournaments — privateConfig validation', () => {
  test('private tournament without whitelist returns 400', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Private Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'private',
        privateConfig: {
          whitelistedPlayers: [],
          groupId: null,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_private_config');
    expect(res.body.message).toContain('at least one whitelisted player');
    expect(mockCreateTournament).not.toHaveBeenCalled();
  });

  test('private tournament with players succeeds', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Private Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'private',
        privateConfig: {
          whitelistedPlayers: ['player-1', 'player-2'],
          groupId: null,
        },
      });

    expect(res.status).toBe(201);
    expect(mockCreateTournament).toHaveBeenCalled();
  });
});

// ─── Gap 4: POST /api/tournaments — Whitelist population ───────────────────────

describe('POST /api/tournaments — whitelist population', () => {
  test('populates whitelist from privateConfig.whitelistedPlayers', async () => {
    const app = buildApp();
    mockCreateTournament.mockResolvedValueOnce('new-tournament-id');

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Private Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'private',
        privateConfig: {
          whitelistedPlayers: ['player-1', 'player-2'],
          groupId: null,
        },
      });

    expect(res.status).toBe(201);
    expect(mockAddToWhitelist).toHaveBeenCalledWith('new-tournament-id', 'player-1', 'coach-uuid');
    expect(mockAddToWhitelist).toHaveBeenCalledWith('new-tournament-id', 'player-2', 'coach-uuid');
  });

  test('calls addGroupToWhitelist when groupId provided', async () => {
    const app = buildApp();
    mockCreateTournament.mockResolvedValueOnce('new-tournament-id');

    const res = await request(app)
      .post('/api/tournaments')
      .send({
        name: 'Private Tournament',
        blindStructure: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
        startingStack: 10000,
        privacy: 'private',
        privateConfig: {
          whitelistedPlayers: ['player-1'],
          groupId: 'group-uuid-1',
        },
      });

    expect(res.status).toBe(201);
    expect(mockAddToWhitelist).toHaveBeenCalledWith('new-tournament-id', 'player-1', 'coach-uuid');
    expect(mockAddGroupToWhitelist).toHaveBeenCalledWith('new-tournament-id', 'group-uuid-1', 'coach-uuid');
  });
});

// ─── Gap 5 & 6: PATCH /api/tournaments/:id/privacy ────────────────────────────

describe('PATCH /api/tournaments/:id/privacy', () => {
  test('only owner can modify tournament privacy', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'other-coach-uuid',
      privacy: 'school',
      school_id: 'school-1',
    });

    const res = await request(app)
      .patch('/api/tournaments/tournament-1/privacy')
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: ['player-1'] },
      });

    expect(res.status).toBe(403);
    expect(mockUpdatePrivacy).not.toHaveBeenCalled();
  });

  test('owner can change privacy to private with whitelist', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'school',
      school_id: 'school-1',
    });
    mockUpdatePrivacy.mockResolvedValueOnce({
      id: 'tournament-1',
      privacy: 'private',
      school_id: 'school-1',
    });

    const res = await request(app)
      .patch('/api/tournaments/tournament-1/privacy')
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: ['player-1'], groupId: null },
      });

    expect(res.status).toBe(200);
    expect(mockAddToWhitelist).toHaveBeenCalledWith('tournament-1', 'player-1', 'coach-uuid');
    expect(mockUpdatePrivacy).toHaveBeenCalledWith('tournament-1', 'private', undefined);
  });

  test('cannot switch to private without whitelist', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'school',
    });

    const res = await request(app)
      .patch('/api/tournaments/tournament-1/privacy')
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [], groupId: null },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_private_config');
  });
});

// ─── Gap 7: POST /api/tournaments/:id/whitelist ────────────────────────────────

describe('POST /api/tournaments/:id/whitelist', () => {
  test('only owner can add players to whitelist', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'other-coach-uuid',
      privacy: 'private',
    });

    const res = await request(app)
      .post('/api/tournaments/tournament-1/whitelist')
      .send({ playerId: 'player-new' });

    expect(res.status).toBe(403);
    expect(mockAddToWhitelist).not.toHaveBeenCalled();
  });

  test('cannot add to non-private tournament', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'school',
    });

    const res = await request(app)
      .post('/api/tournaments/tournament-1/whitelist')
      .send({ playerId: 'player-new' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('not_private');
    expect(mockAddToWhitelist).not.toHaveBeenCalled();
  });

  test('owner can add player to private tournament', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'private',
    });

    const res = await request(app)
      .post('/api/tournaments/tournament-1/whitelist')
      .send({ playerId: 'player-new' });

    expect(res.status).toBe(201);
    expect(mockAddToWhitelist).toHaveBeenCalledWith('tournament-1', 'player-new', 'coach-uuid');
  });

  test('rejects duplicate whitelist entries with 409', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'private',
    });
    mockAddToWhitelist.mockRejectedValueOnce(new Error('Player is already invited to this tournament'));

    const res = await request(app)
      .post('/api/tournaments/tournament-1/whitelist')
      .send({ playerId: 'player-dup' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_invited');
  });
});

// ─── Gap 8: DELETE /api/tournaments/:id/whitelist/:playerId ────────────────────

describe('DELETE /api/tournaments/:id/whitelist/:playerId', () => {
  test('only owner can remove players from whitelist', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'other-coach-uuid',
      privacy: 'private',
    });

    const res = await request(app)
      .delete('/api/tournaments/tournament-1/whitelist/player-remove');

    expect(res.status).toBe(403);
    expect(mockRemoveFromWhitelist).not.toHaveBeenCalled();
  });

  test('owner can remove player from whitelist', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      created_by: 'coach-uuid',
      privacy: 'private',
    });

    const res = await request(app)
      .delete('/api/tournaments/tournament-1/whitelist/player-remove');

    expect(res.status).toBe(200);
    expect(mockRemoveFromWhitelist).toHaveBeenCalledWith('tournament-1', 'player-remove');
  });
});

// ─── Gap 9: GET /api/tournaments/:id — Visibility check (403) ──────────────────

describe('GET /api/tournaments/:id — visibility control', () => {
  test('returns 403 if tournament not visible to user', async () => {
    const app = buildApp();
    mockGetTournamentById.mockResolvedValueOnce({
      id: 'tournament-1',
      privacy: 'private',
      school_id: 'school-1',
      blind_structure: [],
    });
    mockCanPlayerSeeTournament.mockResolvedValueOnce(false);

    const res = await request(app)
      .get('/api/tournaments/tournament-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(res.body.message).toContain('cannot see');
  });

  test('returns tournament if visible to user', async () => {
    const app = buildApp();
    const tournament = {
      id: 'tournament-1',
      privacy: 'school',
      school_id: 'school-1',
      blind_structure: [],
      players: [],
      currentLevel: null,
    };
    mockGetTournamentById.mockResolvedValueOnce(tournament);
    mockCanPlayerSeeTournament.mockResolvedValueOnce(true);

    const res = await request(app)
      .get('/api/tournaments/tournament-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(tournament);
  });
});
