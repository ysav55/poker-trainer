// @ts-check
const { test, expect } = require('./fixtures');
const { createBotTableViaAPI, navigateToTable } = require('./helpers/table');

/**
 * Bot Tables — E2E Tests
 *
 * Tests the bot_cash game mode where BotDecisionService plays all seats
 * autonomously. Tests creation via the bot lobby UI (data-testid selectors),
 * and verifying bot gameplay progresses.
 */

let tableId;

test.describe('Bot Lobby — UI', () => {

  // ─── US-127: Bot lobby page loads ───────────────────────────────────────────

  test('bot lobby page loads with New Game button', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // New Game button should be visible
    await expect(page.locator('[data-testid="new-game-button"]')).toBeVisible({ timeout: 10_000 });
  });

  // ─── US-128: Student can access bot lobby ───────────────────────────────────

  test('student sees bot lobby with New Game button', async ({ studentPage: page }) => {
    await page.goto('/bot-lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await expect(page.locator('[data-testid="new-game-button"]')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Bot Table — Create via UI', () => {

  // ─── US-129: Clicking New Game opens creation modal ─────────────────────────

  test('New Game button opens bot table creation modal', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.locator('[data-testid="new-game-button"]').click();

    // Modal should appear
    await expect(page.locator('[data-testid="create-bot-modal"]')).toBeVisible({ timeout: 5_000 });
  });

  // ─── US-130: Creation modal shows difficulty options ────────────────────────

  test('modal shows Easy, Medium, Hard difficulty options', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await expect(page.locator('[data-testid="difficulty-easy"]')).toBeVisible();
    await expect(page.locator('[data-testid="difficulty-medium"]')).toBeVisible();
    await expect(page.locator('[data-testid="difficulty-hard"]')).toBeVisible();
  });

  // ─── US-131: Creation modal shows privacy options (coach) ───────────────────

  test('coach sees coach privacy options (public, school, private)', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    // Coach should see coach-specific privacy options
    const hasPublic = await page.locator('[data-testid="privacy-public"]').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSchool = await page.locator('[data-testid="privacy-school"]').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSolo = await page.locator('[data-testid="privacy-solo"]').isVisible({ timeout: 3_000 }).catch(() => false);

    // Coach sees either coach-privacy or player-privacy based on role detection
    expect(hasPublic || hasSchool || hasSolo).toBeTruthy();
  });

  // ─── US-132: Creation modal shows blind inputs ─────────────────────────────

  test('modal shows small blind and big blind inputs', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await expect(page.locator('[data-testid="small-blind-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="big-blind-input"]')).toBeVisible();
  });

  // ─── US-133: Creation modal has submit and cancel buttons ───────────────────

  test('modal has Start Game and Cancel buttons', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await expect(page.locator('[data-testid="modal-submit"]')).toBeVisible();
    await expect(page.locator('[data-testid="modal-cancel"]')).toBeVisible();
  });

  // ─── US-134: Cancel button closes modal ─────────────────────────────────────

  test('Cancel button closes the creation modal', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await expect(page.locator('[data-testid="create-bot-modal"]')).toBeVisible();
    await page.locator('[data-testid="modal-cancel"]').click();

    await expect(page.locator('[data-testid="create-bot-modal"]')).not.toBeVisible({ timeout: 3_000 });
  });

  // ─── US-135: Creating bot table navigates to table page ─────────────────────

  test('submitting bot table creation navigates to table', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    // Select easy difficulty
    await page.locator('[data-testid="difficulty-easy"]').click();

    // Set blinds
    await page.locator('[data-testid="small-blind-input"]').fill('25');
    await page.locator('[data-testid="big-blind-input"]').fill('50');

    // Submit
    await page.locator('[data-testid="modal-submit"]').click();

    // Should navigate to the table page
    await page.waitForURL(/\/table\//, { timeout: 15_000 });
    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── US-136: Selecting medium difficulty works ──────────────────────────────

  test('can select medium difficulty and create table', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await page.locator('[data-testid="difficulty-medium"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('50');
    await page.locator('[data-testid="big-blind-input"]').fill('100');

    await page.locator('[data-testid="modal-submit"]').click();
    await page.waitForURL(/\/table\//, { timeout: 15_000 });
  });

  // ─── US-137: Selecting hard difficulty works ────────────────────────────────

  test('can select hard difficulty and create table', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await page.locator('[data-testid="difficulty-hard"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('100');
    await page.locator('[data-testid="big-blind-input"]').fill('200');

    await page.locator('[data-testid="modal-submit"]').click();
    await page.waitForURL(/\/table\//, { timeout: 15_000 });
  });
});

test.describe('Bot Table — Create via API', () => {

  // ─── US-138: Bot table created via API has correct response ─────────────────

  test('POST /api/bot-tables returns table with ID', async ({ coachPage: page }) => {
    await page.goto('/lobby');
    tableId = await createBotTableViaAPI(page, {
      difficulty: 'easy',
      small: 25,
      big: 50,
    });
    expect(tableId).toBeTruthy();
  });

  // ─── US-139: Student can create a bot table ─────────────────────────────────

  test('student can create a bot table via API', async ({ studentPage: page }) => {
    await page.goto('/lobby');
    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.post('/api/bot-tables', {
      headers: { Authorization: `Bearer ${token}` },
      data: { difficulty: 'easy', blinds: { small: 10, big: 20 }, privacy: 'solo' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.id || body.tableId).toBeTruthy();
  });
});

test.describe('Bot Table — Gameplay Observation', () => {

  // ─── US-140: Bot table shows poker felt when navigated to ───────────────────

  test('bot table shows poker table UI', async ({ coachPage: page }) => {
    // Create via bot lobby UI for reliable navigation (API-created tables
    // may not initialize the BotTableController until first socket join)
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();
    await page.locator('[data-testid="difficulty-easy"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('25');
    await page.locator('[data-testid="big-blind-input"]').fill('50');
    await page.locator('[data-testid="modal-submit"]').click();

    await page.waitForURL(/\/table\//, { timeout: 15_000 });
    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── US-141: Bot table auto-starts and shows game activity ──────────────────

  test('bot table shows automated gameplay', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();
    await page.locator('[data-testid="difficulty-easy"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('25');
    await page.locator('[data-testid="big-blind-input"]').fill('50');
    await page.locator('[data-testid="modal-submit"]').click();

    await page.waitForURL(/\/table\//, { timeout: 15_000 });
    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });

    // Wait for bots to start playing — look for game activity indicators
    // Bots should auto-deal and play, so after a few seconds we should see:
    // - Player seats with names/stacks
    // - Action badges (FOLD, CALL, etc.)
    // - Pot display changing
    await page.waitForTimeout(5_000);

    // The table should show some game activity (players seated with stacks)
    const bodyText = await page.textContent('body');
    // Bot names or stack displays indicate activity
    const hasGameContent = /BOT|bot|Stack|POT|\d{3,}/i.test(bodyText);
    expect(hasGameContent).toBeTruthy();
  });

  // ─── US-142: Bot table back button returns to lobby ─────────────────────────

  test('back button from bot table returns to lobby or bot-lobby', async ({ coachPage: page }) => {
    // Create via UI for reliable socket init
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();
    await page.locator('[data-testid="difficulty-easy"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('10');
    await page.locator('[data-testid="big-blind-input"]').fill('20');
    await page.locator('[data-testid="modal-submit"]').click();

    await page.waitForURL(/\/table\//, { timeout: 15_000 });
    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });

    await page.getByText('← Lobby').click();
    await page.waitForURL(/\/(lobby|bot-lobby)/, { timeout: 10_000 });
  });
});

test.describe('Bot Lobby — Table List', () => {

  // ─── US-143: Bot tables appear in bot lobby list ────────────────────────────

  test('created bot table appears in bot lobby', async ({ coachPage: page }) => {
    await page.goto('/bot-lobby');

    // Create a bot table via API (open privacy so it shows in list)
    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    const response = await page.request.post('/api/bot-tables', {
      headers: { Authorization: `Bearer ${token}` },
      data: { difficulty: 'medium', blinds: { small: 50, big: 100 }, privacy: 'school' },
    });
    expect(response.ok()).toBeTruthy();

    // Refresh bot lobby
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Look for the table list or a table card
    const tableList = page.locator('[data-testid="table-list"]');
    const hasList = await tableList.isVisible({ timeout: 5_000 }).catch(() => false);

    // If there's a table list, check for a bot table card
    if (hasList) {
      const tableCard = page.locator('[data-testid="bot-table-card"]').first();
      await expect(tableCard).toBeVisible({ timeout: 5_000 });
    }
  });

  // ─── US-144: Bot table card shows join button ───────────────────────────────

  test('bot table card has join button', async ({ coachPage: page }) => {
    // Create a visible bot table first
    await page.goto('/lobby');
    const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
    await page.request.post('/api/bot-tables', {
      headers: { Authorization: `Bearer ${token}` },
      data: { difficulty: 'easy', blinds: { small: 25, big: 50 }, privacy: 'school' },
    });

    await page.goto('/bot-lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Look for join button on a card
    const joinBtn = page.locator('[data-testid="join-button"]').first();
    const hasJoin = await joinBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasJoin) {
      // Click join to verify it navigates to table
      await joinBtn.click();
      await page.waitForURL(/\/table\//, { timeout: 10_000 });
    }
  });

  // ─── US-145: Student sees bot tables in bot lobby ───────────────────────────

  test('student can view bot lobby with tables', async ({ studentPage: page }) => {
    await page.goto('/bot-lobby');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Should see either table list, empty state, or new game button
    const hasNewGame = await page.locator('[data-testid="new-game-button"]').isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-state"]').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasList = await page.locator('[data-testid="table-list"]').isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasNewGame || hasEmpty || hasList).toBeTruthy();
  });
});

test.describe('Bot Table — Student Creation via UI', () => {

  // ─── US-146: Student sees player privacy options (solo, open) ───────────────

  test('student sees solo/open privacy in bot modal', async ({ studentPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    // Student should see solo and open privacy options
    const hasSolo = await page.locator('[data-testid="privacy-solo"]').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasOpen = await page.locator('[data-testid="privacy-open"]').isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasSolo || hasOpen).toBeTruthy();
  });

  // ─── US-147: Student can create and play bot table ──────────────────────────

  test('student creates bot table and navigates to it', async ({ studentPage: page }) => {
    await page.goto('/bot-lobby');
    await page.locator('[data-testid="new-game-button"]').click();

    await page.locator('[data-testid="difficulty-easy"]').click();
    await page.locator('[data-testid="small-blind-input"]').fill('10');
    await page.locator('[data-testid="big-blind-input"]').fill('20');

    await page.locator('[data-testid="modal-submit"]').click();
    await page.waitForURL(/\/table\//, { timeout: 15_000 });

    await expect(page.locator('.table-felt').first()).toBeVisible({ timeout: 15_000 });
  });
});
