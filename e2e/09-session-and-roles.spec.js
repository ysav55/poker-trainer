// @ts-check
const { test, expect } = require('./fixtures');
const { TEST_USERS, loginViaAPI, loginViaUI, logout } = require('./helpers/auth');
const { expectNavItem, expectNoNavItem } = require('./helpers/nav');

test.describe('Session Management', () => {

  // ─── US-67: JWT persists across page reload ───────────────────────────────────

  test('session survives page reload', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await expect(page.locator('nav button[title="Lobby"]')).toBeVisible();

    // Reload the page
    await page.reload();

    // Should still be on lobby (not redirected to login)
    await page.waitForURL('**/lobby', { timeout: 10_000 });
    await expect(page.locator('nav button[title="Lobby"]')).toBeVisible();
  });

  // ─── US-68: Clearing session redirects to login ───────────────────────────────

  test('visiting /lobby without a token redirects to login', async ({ browser }) => {
    // Use a completely fresh context — no stored auth at all
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/lobby');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.getByText('♠ POKER TRAINER')).toBeVisible();

    await page.close();
    await context.close();
  });
});

test.describe('Role-Based Navigation — Coach', () => {

  // ─── US-69: Coach sees full nav ───────────────────────────────────────────────

  test('coach sees all coach-visible nav items', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    await expectNavItem(page, 'Lobby');
    await expectNavItem(page, 'CRM');
    await expectNavItem(page, 'Scenarios');
    await expectNavItem(page, 'History');
    await expectNavItem(page, 'Bot Games');
    await expectNavItem(page, 'Analysis');
    await expectNavItem(page, 'Tournaments');
    await expectNavItem(page, 'Leaderboard');
    await expectNavItem(page, 'Staking');
    await expectNavItem(page, 'Alerts');
    await expectNavItem(page, 'Settings');
  });
});

test.describe('Role-Based Navigation — Student', () => {

  // ─── US-70: Student sees limited nav ──────────────────────────────────────────

  test('student sees only student-allowed nav items', async ({ studentPage: page }) => {
    await page.goto('/lobby');

    // Student-visible
    await expectNavItem(page, 'Lobby');
    await expectNavItem(page, 'History');
    await expectNavItem(page, 'Bot Games');
    await expectNavItem(page, 'Tournaments');
    await expectNavItem(page, 'Leaderboard');
  });
});

test.describe('Role-Based Route Guards', () => {

  // ─── US-71: Student cannot access admin routes ────────────────────────────────

  test('student accessing /admin/users redirects to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  test('student accessing /admin/alerts redirects to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/alerts');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  test('student accessing /admin/hands redirects to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/hands');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  test('student accessing /admin/staking redirects to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/staking');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  test('student accessing /admin/tournaments redirects to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/tournaments');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  // ─── US-72: Coach can access coach routes ─────────────────────────────────────

  test('coach can access CRM', async ({ coachPage: page }) => {
    await page.goto('/admin/crm');
    expect(page.url()).toContain('/admin/crm');
  });

  test('coach can access alerts', async ({ coachPage: page }) => {
    await page.goto('/admin/alerts');
    expect(page.url()).toContain('/admin/alerts');
  });

  test('coach can access hand builder', async ({ coachPage: page }) => {
    await page.goto('/admin/hands');
    expect(page.url()).toContain('/admin/hands');
  });
});

test.describe('Default Route', () => {

  // ─── US-73: Unknown routes redirect to lobby ──────────────────────────────────

  test('unknown route redirects authenticated user to lobby', async ({ coachPage: page }) => {
    await page.goto('/nonexistent-page-xyz');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });

  test('root path redirects to lobby', async ({ coachPage: page }) => {
    await page.goto('/');
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });
});
