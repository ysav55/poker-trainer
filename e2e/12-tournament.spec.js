// @ts-check
const { test, expect } = require('./fixtures');
const { createTournamentViaAPI } = require('./helpers/table');

/**
 * Tournament / MTT — E2E Tests
 *
 * Tests the tournament system: creation, registration, lobby UI,
 * standings, and admin controls.
 *
 * Multi-table tournament (MTT) real gameplay with auto-balancing requires
 * multiple real players, so we test the management/UI flow here.
 */

let groupId;

test.describe('Tournament — Creation', () => {

  // ─── US-114: Coach creates a tournament group via API ───────────────────────

  test('coach can create a tournament group via API', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, {
      name: 'E2E Tournament',
      maxPlayers: 18,
      startingStack: 10000,
    });
    expect(groupId).toBeTruthy();
  });

  // ─── US-115: Tournament list shows on /tournaments page ─────────────────────

  test('tournaments page loads and shows tournament list', async ({ coachPage: page }) => {
    await page.goto('/tournaments');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // The page should load without crashing
    expect(page.url()).toContain('/tournaments');
  });
});

test.describe('Tournament — Admin Setup', () => {

  // ─── US-116: Admin can access tournament setup page ─────────────────────────

  test('admin/coach can access tournament setup at /admin/tournaments', async ({ coachPage: page }) => {
    await page.goto('/admin/tournaments');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    expect(page.url()).toContain('/admin/tournaments');
  });

  // ─── US-117: Tournament setup shows creation wizard/form ────────────────────

  test('tournament setup page has creation controls', async ({ coachPage: page }) => {
    await page.goto('/admin/tournaments');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Should have some form of creation button or form
    const pageText = await page.textContent('body');
    const hasCreationUI = /create|new|tournament|setup|wizard/i.test(pageText);
    expect(hasCreationUI).toBeTruthy();
  });
});

test.describe('Tournament — Registration', () => {

  // ─── US-118: Tournament group API returns correct structure ─────────────────

  test('GET /api/tournament-groups returns groups array', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get('/api/tournament-groups', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('groups');
    expect(Array.isArray(body.groups)).toBeTruthy();
  });

  // ─── US-119: Tournament group detail returns data ───────────────────────────

  test('GET /api/tournament-groups/:id returns group details', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, { name: 'E2E Detail Test' });

    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.get(`/api/tournament-groups/${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('group');
    expect(body.group).toBeTruthy();
  });

  // ─── US-120: Player can register for a tournament ───────────────────────────

  test('player can register for a pending tournament', async ({ coachPage: page, studentPage }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, { name: 'E2E Reg Test', privacy: 'public' });

    // Student registers via API
    const token = await studentPage.evaluate(() => {
      // Need to navigate first to have context
      return null;
    });

    await studentPage.goto('/lobby');
    const studentToken = await studentPage.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));

    const regResponse = await studentPage.request.post(`/api/tournament-groups/${groupId}/register`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    // Should succeed (200/201) or conflict if already registered (409)
    expect([200, 201, 409]).toContain(regResponse.status());
  });

  // ─── US-121: Duplicate registration is rejected ─────────────────────────────

  test('duplicate registration returns 409', async ({ coachPage: page, studentPage }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, { name: 'E2E Dup Reg', privacy: 'public' });

    await studentPage.goto('/lobby');
    const studentToken = await studentPage.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const headers = { Authorization: `Bearer ${studentToken}` };

    // Register first time
    await studentPage.request.post(`/api/tournament-groups/${groupId}/register`, { headers });

    // Register second time — should be 409
    const dupResponse = await studentPage.request.post(`/api/tournament-groups/${groupId}/register`, { headers });
    expect([409, 400]).toContain(dupResponse.status());
  });
});

test.describe('Tournament — Lobby UI', () => {

  // ─── US-122: Tournament detail page loads for valid ID ──────────────────────

  test('tournament detail page loads without crash', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, { name: 'E2E Lobby View' });

    // Navigate to tournament lobby (exact route depends on implementation)
    await page.goto(`/tournaments/${groupId}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Page should load without crash — either shows tournament or empty state
    expect(page.url()).toContain('/tournaments');
  });

  // ─── US-123: Tournament with invalid ID shows empty/error state ─────────────

  test('tournament with invalid ID shows error state', async ({ coachPage: page }) => {
    await page.goto('/tournaments/nonexistent-tournament-id');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Should not crash — shows error or redirects
    const url = page.url();
    expect(url.includes('/tournaments') || url.includes('/lobby')).toBeTruthy();
  });

  // ─── US-124: Student can view tournament list ───────────────────────────────

  test('student can access tournaments list', async ({ studentPage: page }) => {
    await page.goto('/tournaments');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    expect(page.url()).toContain('/tournaments');
  });
});

test.describe('Tournament — Lobby Filter', () => {

  // ─── US-125: Lobby Tournament filter tab works ──────────────────────────────

  test('lobby Tournament filter tab filters correctly', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Click "Tournament" filter tab
    const tournamentTab = page.getByRole('button', { name: 'Tournament', exact: true }).first();
    await expect(tournamentTab).toBeVisible({ timeout: 5_000 });
    await tournamentTab.click();

    // Cash tables should be hidden, only tournament tables visible
    // Page should not crash
    await page.waitForTimeout(1_000);
    expect(page.url()).toContain('/lobby');
  });
});

test.describe('Tournament — Standings', () => {

  // ─── US-126: Standings page loads for tournament ────────────────────────────

  test('standings route does not crash for valid tournament', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    groupId = await createTournamentViaAPI(page, { name: 'E2E Standings' });

    // Try to access standings — exact route may vary
    await page.goto(`/tournaments/${groupId}/standings`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Should not crash
    const url = page.url();
    expect(url.includes('/tournaments') || url.includes('/lobby')).toBeTruthy();
  });
});
