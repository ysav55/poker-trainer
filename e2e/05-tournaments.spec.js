// @ts-check
const { test, expect } = require('./fixtures');
const { clickSideNav, waitForPageLoad } = require('./helpers/nav');

test.describe('Tournament List', () => {

  // ─── US-34: Coach can view tournament list ────────────────────────────────────

  test('tournament list page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/tournaments');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/tournaments');
  });

  // ─── US-35: Student can view tournament list ──────────────────────────────────

  test('student can access tournament list', async ({ studentPage: page }) => {
    await page.goto('/tournaments');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/tournaments');
  });

  // ─── US-36: Navigate to tournaments via sidebar ───────────────────────────────

  test('sidebar nav to tournaments works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'Tournaments');
    await page.waitForURL('**/tournaments');
  });
});

test.describe('Tournament Detail', () => {

  // ─── US-37: Tournament detail page requires valid group ID ────────────────────

  test('tournament detail with invalid ID shows empty state', async ({ coachPage: page }) => {
    await page.goto('/tournaments/nonexistent-id');
    await waitForPageLoad(page);

    // Should either show an error/empty state or redirect
    // The page should not crash
    const url = page.url();
    expect(
      url.includes('/tournaments') || url.includes('/lobby')
    ).toBeTruthy();
  });
});

test.describe('Tournament Setup (Admin)', () => {

  // ─── US-38: Admin can access tournament setup ─────────────────────────────────

  test('admin can navigate to tournament setup', async ({ adminPage: page }) => {
    await page.goto('/admin/tournaments');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/admin/tournaments');
  });
});
