'use strict';

/**
 * Announcement REST route tests.
 *
 * Endpoints covered:
 *   POST  /api/announcements
 *   GET   /api/announcements
 *   PATCH /api/announcements/:id/read
 *   GET   /api/announcements/unread-count
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/AnnouncementRepository', () => ({
  createAnnouncement: jest.fn(),
  listForPlayer:      jest.fn(),
  markRead:           jest.fn(),
  unreadCount:        jest.fn(),
}));

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required', message: 'Login required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requireRole.js', () =>
  jest.fn((minRole) => (req, res, next) => {
    const hierarchy = ['player', 'student', 'coached_student', 'solo_student', 'coach', 'moderator', 'admin', 'superadmin'];
    const userIdx   = hierarchy.indexOf(req.user?.role ?? '');
    const minIdx    = hierarchy.indexOf(minRole);
    if (userIdx < minIdx)
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient role' });
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request    = require('supertest');
const express    = require('express');
const requireAuth = require('../../auth/requireAuth.js');
const requireRole = require('../../auth/requireRole.js');
const registerAnnouncementRoutes = require('../announcements');
const AnnouncementRepo = require('../../db/repositories/AnnouncementRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerAnnouncementRoutes(app, { requireAuth, requireRole });
  return app;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;

  AnnouncementRepo.createAnnouncement.mockResolvedValue({ id: 'ann-1', title: 'Test', body: 'Body', created_at: '2026-04-01T10:00:00Z' });
  AnnouncementRepo.listForPlayer.mockResolvedValue([]);
  AnnouncementRepo.markRead.mockResolvedValue(undefined);
  AnnouncementRepo.unreadCount.mockResolvedValue(0);
});

// ─── POST /api/announcements ──────────────────────────────────────────────────

describe('POST /api/announcements', () => {
  const app = buildApp();

  test('coach can create an announcement', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    AnnouncementRepo.createAnnouncement.mockResolvedValue({ id: 'ann-new', title: 'Hello', body: 'World' });

    const res = await request(app)
      .post('/api/announcements')
      .send({ title: 'Hello', body: 'World' });
    expect(res.status).toBe(201);
    expect(res.body.announcement).toMatchObject({ id: 'ann-new' });
    expect(AnnouncementRepo.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      authorId: 'coach-uuid',
      title: 'Hello',
      body: 'World',
      targetType: 'all',
    }));
  });

  test('admin can create an announcement', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', role: 'admin' };
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text' });
    expect(res.status).toBe(201);
  });

  test('regular player cannot create announcements', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text' });
    expect(res.status).toBe(403);
  });

  test('returns 400 when title is missing', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/announcements').send({ body: 'Text' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_title');
  });

  test('returns 400 when body is missing', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/announcements').send({ title: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  test('returns 400 for invalid targetType', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text', targetType: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_target_type');
  });

  test('returns 400 when individual targetType lacks targetId', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text', targetType: 'individual' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('target_id_required');
  });

  test('creates individual announcement with targetId', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/announcements').send({
      title: 'Hi', body: 'Text', targetType: 'individual', targetId: 'player-uuid',
    });
    expect(res.status).toBe(201);
    expect(AnnouncementRepo.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'individual',
      targetId: 'player-uuid',
    }));
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text' });
    expect(res.status).toBe(401);
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', role: 'coach' };
    AnnouncementRepo.createAnnouncement.mockRejectedValue(new Error('DB down'));
    const res = await request(app).post('/api/announcements').send({ title: 'Hi', body: 'Text' });
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/announcements/unread-count ─────────────────────────────────────

describe('GET /api/announcements/unread-count', () => {
  const app = buildApp();

  test('returns unread count for authenticated user', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.unreadCount.mockResolvedValue(3);

    const res = await request(app).get('/api/announcements/unread-count');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unreadCount: 3 });
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/announcements/unread-count');
    expect(res.status).toBe(401);
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.unreadCount.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/announcements/unread-count');
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/announcements ───────────────────────────────────────────────────

describe('GET /api/announcements', () => {
  const app = buildApp();

  const sampleAnnouncements = [
    { id: 'ann-2', title: 'Session tonight', body: 'Join at 7pm', createdAt: '2026-04-01T09:00:00Z', readAt: '2026-04-01T09:30:00Z' },
    { id: 'ann-1', title: 'Good work',       body: 'Nice bluff!',  createdAt: '2026-04-01T08:00:00Z', readAt: null },
  ];

  test('returns announcements for authenticated user', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.listForPlayer.mockResolvedValue(sampleAnnouncements);

    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(200);
    expect(res.body.announcements).toEqual(sampleAnnouncements);
    expect(AnnouncementRepo.listForPlayer).toHaveBeenCalledWith('player-uuid', { limit: 50, offset: 0 });
  });

  test('passes limit and offset from query params', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.listForPlayer.mockResolvedValue([]);

    const res = await request(app).get('/api/announcements?limit=20&offset=40');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 20, offset: 40 });
    expect(AnnouncementRepo.listForPlayer).toHaveBeenCalledWith('player-uuid', { limit: 20, offset: 40 });
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(401);
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.listForPlayer.mockRejectedValue(new Error('DB timeout'));
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/announcements/:id/read ───────────────────────────────────────

describe('PATCH /api/announcements/:id/read', () => {
  const app = buildApp();

  test('marks announcement as read', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };

    const res = await request(app).patch('/api/announcements/ann-1/read');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, announcementId: 'ann-1' });
    expect(AnnouncementRepo.markRead).toHaveBeenCalledWith('ann-1', 'player-uuid');
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).patch('/api/announcements/ann-1/read');
    expect(res.status).toBe(401);
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'player-uuid', role: 'player' };
    AnnouncementRepo.markRead.mockRejectedValue(new Error('upsert failed'));
    const res = await request(app).patch('/api/announcements/ann-1/read');
    expect(res.status).toBe(500);
  });
});
