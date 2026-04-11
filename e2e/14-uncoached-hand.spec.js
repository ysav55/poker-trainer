// @ts-check
const { test, expect } = require('./fixtures');
const { createTableViaAPI } = require('./helpers/table');
const {
  waitForTable,
  findActivePlayer,
  playAction,
  checkOrCall,
  playHandToShowdown,
} = require('./helpers/multiplayer');

/**
 * Uncoached Hand -- Multi-Player Hand Lifecycle E2E Tests
 *
 * Tests real multi-player gameplay in uncoached_cash (auto-deal) mode.
 * Each player is a separate browser context with its own JWT.
 *
 * Key behavior:
 * - 2+ players join a table, each in their own browser context
 * - When 2+ non-coach players are seated, the hand auto-starts after ~2s
 * - Game phases: preflop -> flop -> turn -> river -> showdown
 * - After showdown, next hand auto-deals in ~2s
 * - No coach needed
 */

// ============================================================================
// Auto-Deal Start
// ============================================================================

test.describe('Uncoached Hand -- Auto-Deal Start', () => {

  test('hand auto-starts when 2 players join', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    // Coach creates table (students lack table:create permission)
    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E AutoStart ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    // Both students navigate to the table
    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    // Wait for both to see the table felt
    await waitForTable(studentPage);
    await waitForTable(student2Page);

    // With 2 players seated, auto-deal should fire within ~2s.
    // findActivePlayer polls for up to 10s for a FOLD button to appear.
    const activePage = await findActivePlayer([studentPage, student2Page], 15_000);
    expect(activePage).not.toBeNull();
  });
});

// ============================================================================
// Betting Actions
// ============================================================================

test.describe('Uncoached Hand -- Betting Actions', () => {

  test('active player can fold', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Fold ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);

    const pages = [studentPage, student2Page];

    // Wait for auto-start, then fold
    const result = await playAction(pages, 'fold');
    expect(result.action).toBe('fold');

    // With 2 players, a fold ends the hand immediately. Page should not crash.
    await result.page.waitForTimeout(2_000);
    expect(result.page.url()).toContain('/table/');
  });

  test('active player can check/call', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E CheckCall ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);

    const pages = [studentPage, student2Page];

    // Wait for auto-start, then check/call
    const result = await checkOrCall(pages);
    expect(result.action).toBe('check');
    expect(result.page).not.toBeNull();
  });

  test('active player can raise', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Raise ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);

    const pages = [studentPage, student2Page];

    // Wait for auto-start, then raise to 150
    const result = await playAction(pages, 'raise', 150);
    expect(result.action).toBe('raise');
    expect(result.page).not.toBeNull();
  });
});

// ============================================================================
// Full Hand to Showdown
// ============================================================================

test.describe('Uncoached Hand -- Full Hand to Showdown', () => {

  test('hand plays through to showdown when both check/call', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E Showdown ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);

    const pages = [studentPage, student2Page];

    // Play entire hand to showdown via check/call
    await playHandToShowdown(pages);

    // playHandToShowdown returns when hand ends — verify via debug flag
    let showdownSeen = false;
    for (const page of pages) {
      const seen = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (seen) { showdownSeen = true; break; }
    }
    expect(showdownSeen).toBe(true);
  });

  test('auto-deal starts next hand after showdown', async ({ coachPage, studentPage, student2Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E AutoDeal Next ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);

    const pages = [studentPage, student2Page];

    // Play first hand to showdown
    await playHandToShowdown(pages);

    // After showdown, auto-deal should start the next hand within ~2s.
    // findActivePlayer will detect when the next hand's FOLD button appears.
    const activePage = await findActivePlayer(pages, 15_000);
    expect(activePage).not.toBeNull();
  });
});

// ============================================================================
// 3 Players
// ============================================================================

test.describe('Uncoached Hand -- 3 Players', () => {

  test('3-player hand plays to showdown', async ({ coachPage, studentPage, student2Page, student3Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E 3P Showdown ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);
    await student3Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);
    await waitForTable(student3Page);

    const pages = [studentPage, student2Page, student3Page];

    // Play entire hand to showdown via check/call
    await playHandToShowdown(pages);

    // Verify hand ended via debug flags
    let showdownSeen = false;
    for (const page of pages) {
      const seen = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (seen) { showdownSeen = true; break; }
    }
    expect(showdownSeen).toBe(true);
  });

  test('one player folds, other two continue to showdown', async ({ coachPage, studentPage, student2Page, student3Page }) => {
    test.slow();

    await coachPage.goto('/lobby');
    const tableId = await createTableViaAPI(coachPage, {
      name: `E2E 3P Fold ${Date.now()}`,
      mode: 'uncoached_cash',
      sb: 25,
      bb: 50,
      startingStack: 5000,
    });

    await studentPage.goto('/table/' + tableId);
    await student2Page.goto('/table/' + tableId);
    await student3Page.goto('/table/' + tableId);

    await waitForTable(studentPage);
    await waitForTable(student2Page);
    await waitForTable(student3Page);

    const allPages = [studentPage, student2Page, student3Page];

    // First action: one player folds
    const foldResult = await playAction(allPages, 'fold');
    expect(foldResult.action).toBe('fold');

    // Determine remaining pages (the two who didn't fold)
    const remainingPages = allPages.filter(p => p !== foldResult.page);

    // Remaining two players play to showdown
    await playHandToShowdown(remainingPages);

    // Verify hand ended via debug flags
    let showdownSeen = false;
    for (const page of remainingPages) {
      const seen = await page.evaluate(() =>
        window.__DEBUG_SHOWDOWN_SEEN || window.__DEBUG_HAND_ENDED
      ).catch(() => false);
      if (seen) { showdownSeen = true; break; }
    }
    expect(showdownSeen).toBe(true);
  });
});
