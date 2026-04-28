// @ts-check
const { test, expect } = require('./fixtures');
const { createTableViaAPI, navigateToTable } = require('./helpers/table');

/**
 * Uncoached (Auto) Cash Table — E2E Tests
 *
 * Tests the uncoached_cash game mode where auto-dealing occurs and
 * all users (including coaches) can be seated players.
 * No coach sidebar in this mode — the game is fully autonomous.
 */

let tableId;

test.describe('Uncoached Cash — Table Setup', () => {

  // ─── US-103: Create uncoached_cash table via API ────────────────────────────

  test('coach can create an uncoached_cash table', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createTableViaAPI(page, {
      name: 'E2E Uncoached Table',
      mode: 'uncoached_cash',
      sb: 10,
      bb: 20,
      startingStack: 3000,
    });
    expect(tableId).toBeTruthy();
    expect(tableId).toContain('table-');
  });

  // ─── US-104: Navigate to uncoached table and see poker felt ─────────────────

  test('navigate to uncoached table shows poker felt', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createTableViaAPI(page, { name: 'E2E Uncoached Nav', mode: 'uncoached_cash' });
    await navigateToTable(page, tableId);

    await expect(page.locator('.table-felt').first()).toBeVisible();
    await expect(page.getByText('← Lobby')).toBeVisible();
  });

  // ─── US-105: Uncoached table does NOT show coach sidebar ────────────────────

  test('uncoached table has no coach sidebar', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createTableViaAPI(page, { name: 'E2E No Sidebar', mode: 'uncoached_cash' });
    await navigateToTable(page, tableId);

    // Coach sidebar "Start Hand" button should NOT appear in uncoached mode
    const startBtn = page.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Uncoached Cash — Create from Lobby UI', () => {

  // ─── US-106: Select Auto Cash mode in create modal ──────────────────────────

  test('create modal allows selecting Auto Cash mode', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const createBtn = page.getByText(/new table|create table|\+ table/i).first();
    await createBtn.click();

    // Click Auto Cash mode
    await page.getByText('Auto Cash').click();

    // Fill name
    await page.locator('input[placeholder="e.g. Main Table"]').fill('E2E Auto Table');

    // Create button should be available
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  // ─── US-107: Creating Auto Cash table navigates to table page ───────────────

  test('creating Auto Cash table navigates to table page', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const createBtn = page.getByText(/new table|create table|\+ table/i).first();
    await createBtn.click();

    await page.getByText('Auto Cash').click();
    await page.locator('input[placeholder="e.g. Main Table"]').fill('E2E Auto Created');
    await page.getByRole('button', { name: 'Create' }).click();

    // Should navigate to table page
    await page.waitForURL(/\/table\//, { timeout: 10_000 });
    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Uncoached Cash — Table UI', () => {

  // ─── US-108: Uncoached table shows waiting state ────────────────────────────

  test('uncoached table displays waiting state', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createTableViaAPI(page, { name: 'E2E Waiting', mode: 'uncoached_cash' });
    await navigateToTable(page, tableId);

    // Table should be in waiting state (no active hand)
    // The felt is visible, no FOLD/CHECK buttons since no hand is active
    await expect(page.locator('.table-felt')).toBeVisible();

    // No betting controls visible in waiting phase (nobody is seated)
    const foldBtn = page.getByRole('button', { name: 'FOLD' });
    await expect(foldBtn).not.toBeVisible({ timeout: 3_000 });
  });

  // ─── US-109: Uncoached table shows in lobby with correct mode ───────────────

  test('uncoached table appears in lobby', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const tableName = `E2E Auto Lobby ${Date.now()}`;
    tableId = await createTableViaAPI(page, { name: tableName, mode: 'uncoached_cash' });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const tableCard = page.getByText(tableName).first();
    await expect(tableCard).toBeVisible({ timeout: 10_000 });
  });

  // ─── US-110: Lobby filter shows uncoached under "Cash" tab ─────────────────

  test('uncoached table visible under Cash filter', async ({ coachPage: page }) => {
    await page.goto('/lobby');

    const tableName = `E2E Cash Filter ${Date.now()}`;
    tableId = await createTableViaAPI(page, { name: tableName, mode: 'uncoached_cash' });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Click "Cash" filter tab (name may include badge count like "Cash 3")
    const cashTab = page.getByRole('button', { name: /^Cash/ }).first();
    await expect(cashTab).toBeVisible({ timeout: 10_000 });
    await cashTab.click();
    await page.waitForTimeout(1_000);

    // Table should still be visible under Cash filter
    const tableCard = page.getByText(tableName).first();
    await expect(tableCard).toBeVisible({ timeout: 5_000 });
  });

  // ─── US-111: Back button works from uncoached table ─────────────────────────

  test('back to lobby works from uncoached table', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createTableViaAPI(page, { name: 'E2E Back Auto', mode: 'uncoached_cash' });
    await navigateToTable(page, tableId);

    await page.getByText('← Lobby').click();
    await page.waitForURL('**/lobby', { timeout: 10_000 });
  });
});

test.describe('Uncoached Cash — Student Access', () => {

  // ─── US-112: Student can view an open uncoached table ───────────────────────

  test('student can access an open uncoached table', async ({ coachPage, studentPage }) => {
    // Coach creates an open table
    await coachPage.goto('/lobby');
    const tableName = `E2E Student Auto ${Date.now()}`;
    tableId = await createTableViaAPI(coachPage, {
      name: tableName,
      mode: 'uncoached_cash',
      privacy: 'open',
    });

    // Student navigates to the table
    await studentPage.goto(`/table/${tableId}`);
    await expect(studentPage.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── US-113: Student sees no coach controls on uncoached table ──────────────

  test('student sees no admin controls on uncoached table', async ({ coachPage, studentPage }) => {
    await coachPage.goto('/lobby');
    tableId = await createTableViaAPI(coachPage, { name: 'E2E Student NoCoach', mode: 'uncoached_cash', privacy: 'open' });

    await studentPage.goto(`/table/${tableId}`);
    await expect(studentPage.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });

    // Student should NOT see Start Hand
    const startBtn = studentPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).not.toBeVisible({ timeout: 3_000 });
  });
});
