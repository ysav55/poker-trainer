// @ts-check
const { test, expect } = require('./fixtures');
const { clickSideNav, waitForPageLoad } = require('./helpers/nav');

test.describe('Leaderboard', () => {

  // ─── US-18: Coach can view leaderboard ────────────────────────────────────────

  test('leaderboard page loads with period filters', async ({ coachPage: page }) => {
    await page.goto('/leaderboard');
    await waitForPageLoad(page);

    // Period filter options
    await expect(page.getByText('7 Days')).toBeVisible();
    await expect(page.getByText('30 Days')).toBeVisible();
    await expect(page.getByText('All Time')).toBeVisible();
  });

  // ─── US-19: Leaderboard has game type filter ──────────────────────────────────

  test('leaderboard has game type filters', async ({ coachPage: page }) => {
    await page.goto('/leaderboard');
    await waitForPageLoad(page);

    await expect(page.getByRole('button', { name: 'All' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cash' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tournament' }).first()).toBeVisible();
  });

  // ─── US-20: Student can view leaderboard ──────────────────────────────────────

  test('student can access leaderboard', async ({ studentPage: page }) => {
    await page.goto('/leaderboard');
    await waitForPageLoad(page);

    await expect(page.getByText('7 Days')).toBeVisible();
  });

  // ─── US-21: Navigate to leaderboard via sidebar ───────────────────────────────

  test('sidebar nav to leaderboard works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'Leaderboard');
    await page.waitForURL('**/leaderboard');
  });
});

test.describe('Analysis', () => {

  // ─── US-22: Coach can view analysis page ──────────────────────────────────────

  test('analysis page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/analysis');
    await waitForPageLoad(page);

    // Page should be visible (not redirected)
    expect(page.url()).toContain('/analysis');
  });

  // ─── US-23: Navigate to analysis via sidebar ──────────────────────────────────

  test('sidebar nav to analysis works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'Analysis');
    await page.waitForURL('**/analysis');
  });
});

test.describe('Hand History', () => {

  // ─── US-24: User can view hand history ────────────────────────────────────────

  test('hand history page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/history');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/history');
  });

  // ─── US-25: Student can view hand history ─────────────────────────────────────

  test('student can access hand history', async ({ studentPage: page }) => {
    await page.goto('/history');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/history');
  });

  // ─── US-26: Navigate to history via sidebar ───────────────────────────────────

  test('sidebar nav to history works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'History');
    await page.waitForURL('**/history');
  });
});

test.describe('Settings', () => {

  // ─── US-27: Coach can access settings ─────────────────────────────────────────

  test('settings page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/settings');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/settings');
  });

  // ─── US-28: Navigate to settings via sidebar ──────────────────────────────────

  test('sidebar nav to settings works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'Settings');
    await page.waitForURL('**/settings');
  });
});

test.describe('Staking — Student View', () => {

  // ─── US-29: Student can view staking page ─────────────────────────────────────

  test('student staking page loads', async ({ studentPage: page }) => {
    await page.goto('/staking');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/staking');
  });
});
