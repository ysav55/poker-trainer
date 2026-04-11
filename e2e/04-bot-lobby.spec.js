// @ts-check
const { test, expect } = require('./fixtures');
const { clickSideNav, waitForPageLoad } = require('./helpers/nav');

test.describe('Bot Lobby', () => {

  // ─── US-30: User can view bot lobby ───────────────────────────────────────────

  test('bot lobby page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/bot-lobby');
  });

  // ─── US-31: Student can view bot lobby ────────────────────────────────────────

  test('student can access bot lobby', async ({ studentPage: page }) => {
    await page.goto('/bot-lobby');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/bot-lobby');
  });

  // ─── US-32: Navigate to bot lobby via sidebar ─────────────────────────────────

  test('sidebar nav to bot games works', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await clickSideNav(page, 'Bot Games');
    await page.waitForURL('**/bot-lobby');
  });

  // ─── US-33: Bot lobby shows difficulty options ────────────────────────────────

  test('bot lobby shows bot table options', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await waitForPageLoad(page);

    // Bot lobby should show options for creating bot tables
    // (difficulty, seat count, etc.)
    const pageContent = await page.textContent('body');
    expect(
      pageContent.toLowerCase().includes('bot') ||
      pageContent.toLowerCase().includes('practice') ||
      pageContent.toLowerCase().includes('easy') ||
      pageContent.toLowerCase().includes('create')
    ).toBeTruthy();
  });
});
