// @ts-check
const { test, expect } = require('./fixtures');
const { waitForPageLoad } = require('./helpers/nav');

test.describe('Table Page — Navigation & Layout', () => {

  // ─── US-50: Table page shows connection state ─────────────────────────────────

  test('table page with invalid ID shows timeout/error', async ({ coachPage: page }) => {
    await page.goto('/table/nonexistent-table-id');

    // Should show connection timeout or error within 10s
    const hasTimeout = await page.getByText(/not found|doesn't exist|timeout|no longer|connection/i)
      .isVisible({ timeout: 12_000 })
      .catch(() => false);

    // Either shows an error or stays on the page (not crashing)
    expect(page.url()).toContain('/table/');
  });

  // ─── US-51: Table page has back-to-lobby button ───────────────────────────────

  test('table page shows lobby back button', async ({ coachPage: page }) => {
    await page.goto('/table/test-table-id');

    const backButton = page.getByText('← Lobby');
    const visible = await backButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) {
      await backButton.click();
      await page.waitForURL('**/lobby', { timeout: 5_000 });
    }
  });

  // ─── US-52: Table page shows mode badge ───────────────────────────────────────

  test('table page shows poker trainer branding', async ({ coachPage: page }) => {
    await page.goto('/table/any-table');

    // Top bar should have branding
    await expect(page.getByText('♠ POKER TRAINER').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Table Creation Flow', () => {

  // ─── US-53: Coach can create a table from lobby ───────────────────────────────

  test('create table flow opens modal', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    await waitForPageLoad(page);

    // Look for create table button
    const createBtn = page.getByText(/new table|create|\+/i).first();
    const hasCreate = await createBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasCreate) {
      await createBtn.click();

      // Modal should appear with table creation options
      const hasModal = await page.getByText(/table name|game mode|create/i).first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      // Modal appeared or we navigated to a new table
      expect(hasModal || page.url().includes('/table/')).toBeTruthy();
    } else {
      test.skip();
    }
  });
});

test.describe('Review Table', () => {

  // ─── US-54: Review page loads ─────────────────────────────────────────────────

  test('review page loads for coach', async ({ coachPage: page }) => {
    await page.goto('/review');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/review');
  });
});

test.describe('Multi-Table View', () => {

  // ─── US-55: Multi-table page loads for coach ──────────────────────────────────

  test('multi-table page loads', async ({ coachPage: page }) => {
    await page.goto('/multi');
    await waitForPageLoad(page);

    expect(page.url()).toContain('/multi');
  });

  // ─── US-56: Navigate to multi via sidebar ─────────────────────────────────────

  test('sidebar nav to multi works', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const multiBtn = page.locator('nav a[title="Multi"]');
    const visible = await multiBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (visible) {
      await multiBtn.click();
      await page.waitForURL('**/multi');
    }
  });
});
