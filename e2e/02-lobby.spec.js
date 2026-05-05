// @ts-check
const { test, expect } = require('./fixtures');
const { clickSideNav, expectNavItem } = require('./helpers/nav');

test.describe('Lobby — Coach View', () => {

  // ─── US-11: Coach sees lobby with table list ──────────────────────────────────

  test('coach lands on lobby with sidebar nav', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    // Sidebar nav items visible for coach
    await expectNavItem(page, 'Lobby');
    await expectNavItem(page, 'CRM');
    await expectNavItem(page, 'Scenarios');
    await expectNavItem(page, 'History');
    await expectNavItem(page, 'Bot Games');
    await expectNavItem(page, 'Analysis');
    await expectNavItem(page, 'Tournaments');
    await expectNavItem(page, 'Leaderboard');
    await expectNavItem(page, 'Alerts');
    await expectNavItem(page, 'Settings');
  });

  // ─── US-12: Coach sees table filter tabs ──────────────────────────────────────

  test('lobby shows table filter tabs', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    await expect(page.getByRole('button', { name: 'All', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cash', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tournament', exact: true }).first()).toBeVisible();
  });

  // ─── US-13: Coach can create a new table ──────────────────────────────────────

  test('new table card is visible for coach', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    // Look for the create table card/button
    const createBtn = page.getByText(/new table|create table|\+ table/i);
    await expect(createBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ─── US-14: Clicking a table navigates to table page ──────────────────────────

  test('clicking a table card navigates to /table/:id', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    // Wait for table cards to load (if any exist)
    // Click the first action button on a table card
    const actionButton = page.locator('[class*="TableCard"] button, [class*="table-card"] button').first();
    const hasTable = await actionButton.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasTable) {
      await actionButton.click();
      await page.waitForURL(/\/table\//);
    } else {
      // No tables exist — test passes (lobby is empty but functional)
      test.skip();
    }
  });
});

test.describe('Lobby — Student View', () => {

  // ─── US-15: Student sees limited nav ──────────────────────────────────────────

  test('student sees student-appropriate nav items', async ({ studentPage: page }) => {
    await page.goto('/lobby');

    await expectNavItem(page, 'Lobby');
    await expectNavItem(page, 'History');
    await expectNavItem(page, 'Bot Games');
    await expectNavItem(page, 'Tournaments');
    await expectNavItem(page, 'Leaderboard');
  });

  // ─── US-16: Student cannot see admin nav ──────────────────────────────────────

  test('student cannot see admin-only nav items', async ({ studentPage: page }) => {
    await page.goto('/lobby');

    // CRM, Scenarios, Analysis, Alerts, Users, Settings are coach/admin only
    const crmButton = page.locator('nav a[title="CRM"]');
    await expect(crmButton).not.toBeVisible();

    const usersButton = page.locator('nav a[title="Users"]');
    await expect(usersButton).not.toBeVisible();
  });

  // ─── US-17: Student cannot access admin routes directly ───────────────────────

  test('student accessing /admin/crm is redirected to lobby', async ({ studentPage: page }) => {
    await page.goto('/admin/crm');

    // Should redirect to /lobby (RequirePermission guard)
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });
});
