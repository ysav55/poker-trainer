// @ts-check
const { test, expect } = require('./fixtures');
const { createTableViaAPI, togglePauseViaAPI } = require('./helpers/table');
const {
  waitForTable,
  findActivePlayer,
  playAction,
  playHandToShowdown,
} = require('./helpers/multiplayer');

/**
 * Coached Hand -- Multi-Player Hand Lifecycle E2E Tests
 *
 * Tests real multi-player gameplay in coached_cash mode.
 * Each player is a separate browser context with its own JWT.
 *
 * Key behavior:
 * - Coach creates the table (mode: 'coached_cash') and is a PLAYER with coach controls
 * - Students join as seated players
 * - Coach must click "Start Hand" to begin each hand (no auto-deal)
 * - Coach must click "Reset" after showdown before starting the next hand
 * - Coach can "Pause Game" / "Resume Game" during play
 * - When paused, BettingControls hides (FOLD disappears from active player)
 *
 * NOTE: The coach IS dealt into the hand and takes turns like any other player.
 * All findActivePlayer / playHandToShowdown calls must include coachPage.
 */

// ============================================================================
// Coach Starts Hand
// ============================================================================

test.describe('Coached Hand -- Coach Starts Hand', () => {

  test('coach starts hand with 2 players seated', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    // Coach creates a coached_cash table
    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach Start ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    // Coach navigates first, then students
    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    // Wait for all three to see the table felt
    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Coach clicks "Start Hand" to begin the hand
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // findActivePlayer — coach is also a player, so include all pages
    const allPages = [coachPage, studentPage, student2Page];
    const activePage = await findActivePlayer(allPages, 15_000);
    expect(activePage).not.toBeNull();
  });
});

// ============================================================================
// Full Hand Lifecycle
// ============================================================================

test.describe('Coached Hand -- Full Hand Lifecycle', () => {

  test('coached hand plays through to showdown', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach Showdown ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Coach starts the hand
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Play entire hand to showdown — coach is a player, include all pages
    const allPages = [coachPage, studentPage, student2Page];
    await playHandToShowdown(allPages);

    // Verify hand ended — check debug flags or WINNER text
    let showdownSeen = false;
    for (const page of allPages) {
      const visible = await page.getByText(/WINNER|SPLIT POT/i).first()
        .isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) { showdownSeen = true; break; }
      const flagged = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (flagged) { showdownSeen = true; break; }
    }
    expect(showdownSeen).toBe(true);
  });

  test('coach can reset and start a second hand', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach Reset ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Play first hand to showdown — coach is a player, include all pages
    const allPages = [coachPage, studentPage, student2Page];
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    await playHandToShowdown(allPages);

    // Coach clicks "Reset" to clear the hand
    const resetBtn = coachPage.getByRole('button', { name: 'Reset' });
    await expect(resetBtn).toBeVisible({ timeout: 10_000 });
    await resetBtn.click();

    // Wait for reset to process
    await coachPage.waitForTimeout(1_000);

    // Coach clicks "Start Hand" again for the second hand
    const startBtn2 = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn2).toBeVisible({ timeout: 10_000 });
    await startBtn2.click();

    // Verify second hand started -- findActivePlayer should return non-null
    const activePage = await findActivePlayer(allPages, 15_000);
    expect(activePage).not.toBeNull();
  });
});

// ============================================================================
// Coach Controls During Play
// ============================================================================

test.describe('Coached Hand -- Coach Controls During Play', () => {

  test('coach can pause during active hand', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach Pause ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Coach starts the hand
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Verify a player has the turn (FOLD visible) — include coach since they're a player
    const allPages = [coachPage, studentPage, student2Page];
    const activeBeforePause = await findActivePlayer(allPages, 15_000);
    expect(activeBeforePause).not.toBeNull();

    // Coach pauses via REST API (socket transport dies in E2E after start_game)
    const pauseResult = await togglePauseViaAPI(coachPage, tableId);
    expect(pauseResult.ok).toBe(true);
    expect(pauseResult.paused).toBe(true);

    // Reload pages to get fresh state reflecting pause
    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);
    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);
    await coachPage.waitForTimeout(1_000);

    // Verify no player has FOLD visible while paused
    const pausedActive = await findActivePlayer(allPages, 3_000);
    expect(pausedActive).toBeNull();

    // Verify paused state visible in the UI (game_state has paused=true)
    const pausedFlag = await coachPage.evaluate(() => window.__DEBUG_GAME_STATE?.paused);
    expect(pausedFlag).toBe(true);

    // Coach resumes via REST API — verify server returns paused=false
    const resumeResult = await togglePauseViaAPI(coachPage, tableId);
    expect(resumeResult.ok).toBe(true);
    expect(resumeResult.paused).toBe(false);
  });

  test('all-but-one fold ends the hand (fold-win)', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach FoldWin ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Coach starts the hand
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // 3 players (coach + 2 students): fold twice to end the hand
    const allPages = [coachPage, studentPage, student2Page];
    const fold1 = await playAction(allPages, 'fold');

    // Brief wait for game state to propagate before second fold
    await coachPage.waitForTimeout(1_500);

    // Check if hand already ended (2-player fold = fold-win)
    const handAlreadyOver = await coachPage.evaluate(() => {
      const gs = window.__DEBUG_GAME_STATE;
      return gs?.phase === 'showdown' || gs?.phase === 'waiting' || window.__DEBUG_HAND_ENDED;
    }).catch(() => false);

    if (!handAlreadyOver) {
      await playAction(allPages, 'fold');
    }

    // Wait for the hand to end
    await coachPage.waitForTimeout(2_000);

    // Verify hand ended: WINNER text or Reset button visible or debug flags set.
    let handEnded = false;
    for (const page of allPages) {
      const winnerVisible = await page.getByText(/WINNER/i).first()
        .isVisible({ timeout: 1_000 }).catch(() => false);
      if (winnerVisible) { handEnded = true; break; }
      const flagged = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (flagged) { handEnded = true; break; }
    }
    if (!handEnded) {
      // Check if Reset button is visible on coach page (hand ended, ready for reset)
      const resetBtn = coachPage.getByRole('button', { name: 'Reset' });
      const resetVisible = await resetBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      handEnded = resetVisible;
    }
    expect(handEnded).toBe(true);
  });
});

// ============================================================================
// 3 Players (+ coach = 4 total)
// ============================================================================

test.describe('Coached Hand -- 3 Students', () => {

  test('3-student coached hand to showdown', async ({ coachPage, studentPage, student2Page, student3Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Coach 3P ${Date.now()}`,
      mode: 'coached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    // Coach navigates first, then all 3 students
    await coachPage.goto('/table/' + tableId);
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);
    await student3Page.goto('/table/' + tableId);

    await waitForTable(coachPage);
    await waitForTable(studentPage);
    await waitForTable(student2Page);
    await waitForTable(student3Page);

    // Wait for sockets to fully connect and players to be seated
    await coachPage.waitForTimeout(2_000);

    // Coach starts the hand
    const startBtn = coachPage.getByRole('button', { name: 'Start Hand' });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Play entire hand to showdown with all 4 players (coach + 3 students)
    const allPages = [coachPage, studentPage, student2Page, student3Page];
    await playHandToShowdown(allPages);

    // Verify hand ended — check debug flags or WINNER text
    let showdownSeen = false;
    for (const page of allPages) {
      const visible = await page.getByText(/WINNER|SPLIT POT/i).first()
        .isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) { showdownSeen = true; break; }
      const flagged = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (flagged) { showdownSeen = true; break; }
    }
    expect(showdownSeen).toBe(true);
  });
});
