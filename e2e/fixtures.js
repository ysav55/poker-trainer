// @ts-check
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Extended test fixtures for the poker-trainer E2E suite.
 *
 * Provides:
 *   - coachPage:   a Page pre-authenticated as the coach user
 *   - studentPage: a Page pre-authenticated as the student user
 *   - adminPage:   a Page pre-authenticated as the admin user
 *
 * Each fixture reads the saved auth token from e2e/.auth/<role>.json,
 * injects it into sessionStorage via page.addInitScript, and navigates
 * to the app so the AuthContext picks it up.
 */
exports.test = base.test.extend({
  coachPage: async ({ browser }, use) => {
    const page = await createAuthenticatedPage(browser, 'coach');
    await use(page);
    await page.close();
  },

  studentPage: async ({ browser }, use) => {
    const page = await createAuthenticatedPage(browser, 'student');
    await use(page);
    await page.close();
  },

  adminPage: async ({ browser }, use) => {
    const page = await createAuthenticatedPage(browser, 'admin');
    await use(page);
    await page.close();
  },

  student2Page: async ({ browser }, use) => {
    const page = await createAuthenticatedPage(browser, 'student2');
    await use(page);
    await page.close();
  },

  student3Page: async ({ browser }, use) => {
    const page = await createAuthenticatedPage(browser, 'student3');
    await use(page);
    await page.close();
  },
});

exports.expect = base.expect;

/**
 * Create a new browser page with auth credentials injected into sessionStorage.
 */
async function createAuthenticatedPage(browser, role) {
  const authFile = path.join(__dirname, '.auth', `${role}.json`);
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Auth file not found: ${authFile}\n` +
      `Run "npx playwright test --project=auth-setup" first, or ensure test users exist in the DB.`
    );
  }

  const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  const context = await browser.newContext();

  // Inject the JWT into sessionStorage before any page loads
  await context.addInitScript((authData) => {
    sessionStorage.setItem('poker_trainer_jwt', authData.token);
    sessionStorage.setItem('poker_trainer_player_id', authData.stableId);
  }, auth);

  const page = await context.newPage();
  return page;
}
