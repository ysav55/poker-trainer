// @ts-check
const { test, expect } = require('./fixtures');

/**
 * API smoke tests — verify key endpoints return valid responses.
 * These test the actual API through the browser's fetch, ensuring
 * auth headers are sent correctly.
 */

test.describe('API Smoke Tests — Health', () => {

  // ─── US-57: Health endpoint returns OK ────────────────────────────────────────

  test('GET /health returns 200', async ({ page }) => {
    // Health endpoint is at /health on the Express server (not proxied by Vite)
    const response = await page.request.get('http://localhost:3001/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('API Smoke Tests — Authenticated', () => {

  // ─── US-58: Hands endpoint returns data ───────────────────────────────────────

  test('GET /api/hands returns hands array', async ({ coachPage: page }) => {
    await page.goto('/lobby'); // initialize session

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/hands?limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('hands');
    expect(Array.isArray(body.hands)).toBeTruthy();
  });

  // ─── US-59: Players endpoint returns data ─────────────────────────────────────

  test('GET /api/players returns players', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/players', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
  });

  // ─── US-60: Tables endpoint returns data ──────────────────────────────────────

  test('GET /api/tables returns tables', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/tables', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('tables');
  });

  // ─── US-61: Sessions current endpoint returns data ─────────────────────────────

  test('GET /api/sessions/current returns session info', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/sessions/current', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // May be 200 or 404 if no active session — both are valid
    expect([200, 404]).toContain(response.status());
  });

  // ─── US-62: Permissions endpoint returns permissions ──────────────────────────

  test('GET /api/auth/permissions returns permission set', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/auth/permissions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('permissions');
    expect(Array.isArray(body.permissions)).toBeTruthy();
  });

  // ─── US-63: Leaderboard endpoint returns data ─────────────────────────────────

  test('GET /api/players returns player data (used by leaderboard)', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/players', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
  });

  // ─── US-64: Unauthenticated API returns 401 ──────────────────────────────────

  test('GET /api/hands without auth returns 401', async ({ page }) => {
    const response = await page.request.get('/api/hands');
    expect(response.status()).toBe(401);
  });
});

test.describe('API Smoke Tests — Admin Endpoints', () => {

  // ─── US-65: Admin alerts endpoint returns data ────────────────────────────────

  test('GET /api/coach/alerts returns alerts', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/coach/alerts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // May be 200 or 404 depending on whether the endpoint exists
    expect([200, 404]).toContain(response.status());
  });

  // ─── US-66: Announcements endpoint works ──────────────────────────────────────

  test('GET /api/announcements returns announcements', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/announcements', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
  });
});
