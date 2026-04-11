// @ts-check
const { expect } = require('@playwright/test');

/**
 * Multi-player orchestration helpers for E2E poker hand lifecycle tests.
 *
 * These helpers solve the core challenge of multi-player E2E testing:
 * determining which browser page has the active turn, and executing
 * betting actions on the correct page.
 *
 * Key insight: the BettingControls component only renders the FOLD button
 * when `gameState.current_turn === myId` AND the phase is active (preflop–river)
 * AND the game is not paused. So we can detect "whose turn is it" by checking
 * which page has a visible AND enabled FOLD button.
 *
 * Showdown detection: the server resets game state almost immediately after
 * showdown, so the "WINNER" text is visible for milliseconds. We use the
 * window.__DEBUG_GAME_STATE hook (injected in useGameState.js) to detect
 * phase transitions reliably.
 */

/**
 * Wait for the table felt to appear on a page.
 * Simple wait — no page reload to avoid duplicate player entries.
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout
 */
async function waitForTable(page, timeout = 20_000) {
  const felt = page.locator('.table-felt').first();
  await expect(felt).toBeVisible({ timeout });
}

/**
 * Poll all player pages to find which one currently has the active turn.
 * Returns the page that has betting controls (FOLD button visible AND enabled), or null.
 *
 * @param {import('@playwright/test').Page[]} pages
 * @param {number} timeout — max time to poll before giving up
 * @returns {Promise<import('@playwright/test').Page | null>}
 */
async function findActivePlayer(pages, timeout = 15_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const page of pages) {
      const foldBtn = page.getByRole('button', { name: 'FOLD' });
      const visible = await foldBtn.isVisible({ timeout: 200 }).catch(() => false);
      if (visible) {
        const enabled = await foldBtn.isEnabled({ timeout: 200 }).catch(() => false);
        if (enabled) return page;
      }
    }
    await pages[0].waitForTimeout(500);
  }
  return null;
}

/**
 * Execute a betting action on whichever page currently has the turn.
 *
 * @param {import('@playwright/test').Page[]} pages
 * @param {'fold' | 'check' | 'call' | 'raise'} action
 * @param {number} [raiseAmount] — required if action is 'raise'
 * @param {number} [timeout] — how long to wait for a turn to appear
 * @returns {Promise<{ page: import('@playwright/test').Page, action: string }>}
 */
async function playAction(pages, action, raiseAmount, timeout = 15_000) {
  const activePage = await findActivePlayer(pages, timeout);
  if (!activePage) throw new Error(`No player has an active turn after ${timeout}ms`);

  if (action === 'fold') {
    await activePage.getByRole('button', { name: 'FOLD' }).click();
  } else if (action === 'check' || action === 'call') {
    const checkBtn = activePage.getByRole('button', { name: 'CHECK' });
    const canCheck = await checkBtn.isVisible({ timeout: 500 }).catch(() => false);
    if (canCheck) {
      await checkBtn.click();
    } else {
      const callBtn = activePage.getByRole('button', { name: /^CALL/ });
      await expect(callBtn).toBeEnabled({ timeout: 5_000 });
      await callBtn.click();
    }
  } else if (action === 'raise') {
    await activePage.getByRole('button', { name: /^RAISE/ }).click();
    await activePage.waitForTimeout(300);

    if (raiseAmount != null) {
      const amountInput = activePage.locator('input[type="number"]').last();
      await amountInput.fill(String(raiseAmount));
    }

    await activePage.getByRole('button', { name: /^RAISE/ }).click();
  }

  // Wait for server to process the action and send updated game_state
  await activePage.waitForTimeout(1_000);

  return { page: activePage, action };
}

/**
 * Shorthand: play check-or-call for whoever has the turn.
 */
async function checkOrCall(pages, timeout = 15_000) {
  return playAction(pages, 'check', undefined, timeout);
}

/**
 * Play a complete hand to showdown by having all players check/call every street.
 * Returns once the hand has ended (detected via phase transition or WINNER text).
 *
 * @param {import('@playwright/test').Page[]} pages — all player pages
 * @param {number} maxActions — safety limit to prevent infinite loops
 */
async function playHandToShowdown(pages, maxActions = 40) {
  // Reset hand-tracking flags before starting
  await resetHandFlags(pages);

  let actionCount = 0;

  while (actionCount < maxActions) {
    // Check if hand ended (showdown or waiting after hand)
    if (await _isHandOver(pages)) return;

    // Find who has the turn
    const activePage = await findActivePlayer(pages, 8_000);
    if (!activePage) {
      // No active player — hand may have ended, check again
      await pages[0].waitForTimeout(2_000);
      if (await _isHandOver(pages)) return;
      continue;
    }

    // Play check/call
    await playAction(pages, 'check');
    actionCount++;

    // Quick check right after action — might have triggered showdown
    if (await _isHandOver(pages)) return;
  }

  throw new Error(`Hand did not reach showdown after ${maxActions} actions`);
}

/**
 * Reset the hand-tracking debug flags on all pages.
 * Call this before starting a new hand to clear stale flags.
 * @param {import('@playwright/test').Page[]} pages
 */
async function resetHandFlags(pages) {
  for (const page of pages) {
    await page.evaluate(() => {
      window.__DEBUG_SHOWDOWN_SEEN = false;
      window.__DEBUG_HAND_ENDED = false;
      window.__DEBUG_HAND_ACTIVE = false;
    }).catch(() => {});
  }
}

/**
 * Check whether the hand has ended on any page.
 * Uses multiple signals since showdown text is visible for only milliseconds:
 * 1. DOM: "WINNER" or "SPLIT POT" text visible
 * 2. Debug flag: __DEBUG_SHOWDOWN_SEEN (set when phase='showdown' was received)
 * 3. Debug flag: __DEBUG_HAND_ENDED (set when phase transitions from active to waiting)
 *
 * @param {import('@playwright/test').Page[]} pages
 * @returns {Promise<boolean>}
 */
async function _isHandOver(pages) {
  for (const page of pages) {
    // Check DOM text first (fast path)
    const visible = await page.getByText(/WINNER|SPLIT POT/i).first()
      .isVisible({ timeout: 200 }).catch(() => false);
    if (visible) return true;

    // Check debug flags (most reliable — persists after brief phase transitions)
    try {
      const flags = await page.evaluate(() => ({
        showdownSeen: window.__DEBUG_SHOWDOWN_SEEN,
        handEnded: window.__DEBUG_HAND_ENDED,
        phase: window.__DEBUG_GAME_STATE?.phase,
      }));
      if (flags.showdownSeen || flags.handEnded) return true;
    } catch {
      // page might be closed
    }
  }
  return false;
}

module.exports = {
  waitForTable,
  findActivePlayer,
  playAction,
  checkOrCall,
  playHandToShowdown,
  resetHandFlags,
};
