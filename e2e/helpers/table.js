// @ts-check
const { expect } = require('@playwright/test');

/**
 * Create a table via the REST API and return its ID.
 * @param {import('@playwright/test').Page} page — authenticated page
 * @param {{ name?: string, mode?: string, sb?: number, bb?: number, startingStack?: number, privacy?: string }} opts
 * @returns {Promise<string>} table ID
 */
async function createTableViaAPI(page, opts = {}) {
  const {
    name = `E2E Table ${Date.now()}`,
    mode = 'coached_cash',
    sb = 25,
    bb = 50,
    startingStack = 5000,
    privacy = 'open',
  } = opts;

  const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
  const response = await page.request.post('/api/tables', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, mode, config: { sb, bb, startingStack }, privacy },
  });

  expect(response.ok(), `Failed to create table: ${response.status()}`).toBeTruthy();
  const table = await response.json();
  return table.id;
}

/**
 * Create a bot table via the REST API and return its ID.
 * @param {import('@playwright/test').Page} page — authenticated page
 * @param {{ difficulty?: string, small?: number, big?: number, privacy?: string }} opts
 * @returns {Promise<string>} table ID
 */
async function createBotTableViaAPI(page, opts = {}) {
  const {
    difficulty = 'easy',
    small = 25,
    big = 50,
    privacy = 'school',  // coach default; students should pass 'solo'
  } = opts;

  const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
  const response = await page.request.post('/api/bot-tables', {
    headers: { Authorization: `Bearer ${token}` },
    data: { difficulty, blinds: { small, big }, privacy },
  });

  expect(response.ok(), `Failed to create bot table: ${response.status()}`).toBeTruthy();
  const table = await response.json();
  return table.id;
}

/**
 * Create a tournament group via the REST API and return its group ID.
 * @param {import('@playwright/test').Page} page — authenticated page (coach+)
 * @param {object} opts
 * @returns {Promise<string>} group ID
 */
async function createTournamentViaAPI(page, opts = {}) {
  const {
    name = `E2E Tournament ${Date.now()}`,
    maxPlayers = 18,
    maxPlayersPerTable = 9,
    minPlayersPerTable = 2,
    startingStack = 10000,
    blindSchedule = [{ sb: 25, bb: 50, duration: 600 }, { sb: 50, bb: 100, duration: 600 }],
    privacy = 'public',
  } = opts;

  const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
  const response = await page.request.post('/api/tournament-groups', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, maxPlayers, maxPlayersPerTable, minPlayersPerTable, startingStack, blindSchedule, privacy },
  });

  expect(response.ok(), `Failed to create tournament: ${response.status()}`).toBeTruthy();
  const body = await response.json();
  return body.groupId;
}

/**
 * Navigate to a table and wait for the socket to connect + game_state to arrive.
 * Returns once the poker table UI is visible.
 */
async function navigateToTable(page, tableId) {
  await page.goto(`/table/${tableId}`);

  // Wait for the poker table felt to appear (socket connected + game_state received)
  const felt = page.locator('.table-felt').first();
  const visible = await felt.isVisible({ timeout: 10_000 }).catch(() => false);

  if (!visible) {
    // Retry once — socket connection may have been slow
    await page.reload();
    await expect(felt).toBeVisible({ timeout: 15_000 });
  }
}

/**
 * Wait for a specific game phase to appear in the UI.
 * Uses polling on the game state phase indicator.
 */
async function waitForPhase(page, phase, timeout = 15_000) {
  // The phase is reflected in various UI elements:
  // - Board cards count (0=waiting/preflop, 3=flop, 4=turn, 5=river)
  // - Action buttons visibility
  // - Showdown result display
  // We'll poll using page.evaluate to check the phase from the React state
  // But since we can't easily access React state, we'll use UI heuristics

  if (phase === 'showdown') {
    // Wait for winner display or showdown result
    await expect(page.getByText(/WINNER|SPLIT POT/i).first()).toBeVisible({ timeout });
    return;
  }

  if (phase === 'preflop') {
    // Preflop: no board cards, but hand is active (someone has cards)
    // Wait for action buttons or turn indicator
    await page.waitForFunction(() => {
      // Look for action badge or turn indicator
      return document.querySelector('.turn-indicator') !== null
        || document.querySelector('button')?.textContent?.includes('FOLD');
    }, { timeout });
    return;
  }

  // For flop/turn/river, count visible board cards
  const expectedCards = phase === 'flop' ? 3 : phase === 'turn' ? 4 : phase === 'river' ? 5 : 0;
  if (expectedCards > 0) {
    await page.waitForFunction((count) => {
      // Board cards are rendered as card elements
      const boardArea = document.querySelector('[class*="board"]') || document.querySelector('.table-felt');
      if (!boardArea) return false;
      const cards = boardArea.querySelectorAll('[class*="card"]');
      return cards.length >= count;
    }, expectedCards, { timeout });
  }
}

/**
 * Delete a table via API (cleanup).
 */
async function deleteTableViaAPI(page, tableId) {
  const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
  await page.request.delete(`/api/tables/${tableId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/**
 * Toggle pause on a table via REST API.
 * Bypasses socket (transport dies in E2E after start_game).
 * @param {import('@playwright/test').Page} page — authenticated coach page
 * @param {string} tableId
 * @returns {Promise<{ ok: boolean, paused: boolean }>}
 */
async function togglePauseViaAPI(page, tableId) {
  const token = await page.evaluate(() => sessionStorage.getItem('poker_trainer_jwt'));
  const response = await page.request.post(`http://localhost:3001/api/tables/${tableId}/toggle-pause`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new Error(`togglePause failed: ${response.status()} ${body}`);
  }
  return response.json();
}

module.exports = {
  createTableViaAPI,
  createBotTableViaAPI,
  createTournamentViaAPI,
  navigateToTable,
  waitForPhase,
  deleteTableViaAPI,
  togglePauseViaAPI,
};
