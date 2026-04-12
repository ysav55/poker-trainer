// @ts-check
const { expect } = require('@playwright/test');

/**
 * Test credentials — must exist in the DB for E2E tests to work.
 *
 * Before running E2E tests, ensure these users exist:
 *   1. A coach/admin user (for admin-level tests)
 *   2. A student user (for student-level tests)
 *
 * Set via environment variables or fall back to defaults.
 */
const TEST_USERS = {
  coach: {
    name: process.env.E2E_COACH_NAME || 'TestCoach',
    password: process.env.E2E_COACH_PASSWORD || 'testcoach123',
  },
  student: {
    name: process.env.E2E_STUDENT_NAME || 'TestStudent',
    password: process.env.E2E_STUDENT_PASSWORD || 'teststudent123',
  },
  admin: {
    name: process.env.E2E_ADMIN_NAME || 'TestAdmin',
    password: process.env.E2E_ADMIN_PASSWORD || 'testadmin123',
  },
  student2: {
    name: process.env.E2E_STUDENT2_NAME || 'TestStudent2',
    password: process.env.E2E_STUDENT2_PASSWORD || 'teststudent2',
  },
  student3: {
    name: process.env.E2E_STUDENT3_NAME || 'TestStudent3',
    password: process.env.E2E_STUDENT3_PASSWORD || 'teststudent3',
  },
};

const STORAGE_STATE_DIR = 'e2e/.auth';

/**
 * Login via the API and inject the JWT into sessionStorage.
 * Returns the login response data.
 */
async function loginViaAPI(page, { name, password }) {
  // Navigate to login page first so we have a page context for sessionStorage
  await page.goto('/login');

  // Call login API directly
  const response = await page.request.post('/api/auth/login', {
    data: { name, password },
  });

  expect(response.ok(), `Login failed for ${name}: ${response.status()}`).toBeTruthy();
  const data = await response.json();

  // Inject JWT into sessionStorage (same as AuthContext does on login)
  await page.evaluate((loginData) => {
    sessionStorage.setItem('poker_trainer_jwt', loginData.token);
    sessionStorage.setItem('poker_trainer_player_id', loginData.stableId);
  }, data);

  return data;
}

/**
 * Login via the UI form (for testing the actual login flow).
 */
async function loginViaUI(page, { name, password }) {
  await page.goto('/login');
  await page.getByPlaceholder('Enter your name').fill(name);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
}

/**
 * Assert that the page has navigated to the lobby after login.
 */
async function expectLobbyLoaded(page) {
  await page.waitForURL('**/lobby', { timeout: 10_000 });
  // Lobby should show the sidebar nav (use anchor title to avoid strict mode violation)
  await expect(page.locator('nav a[title="Lobby"]')).toBeVisible({ timeout: 10_000 });
}

/**
 * Logout by clearing sessionStorage and navigating.
 */
async function logout(page) {
  await page.evaluate(() => {
    sessionStorage.removeItem('poker_trainer_jwt');
    sessionStorage.removeItem('poker_trainer_player_id');
  });
  await page.goto('/login');
}

module.exports = {
  TEST_USERS,
  STORAGE_STATE_DIR,
  loginViaAPI,
  loginViaUI,
  expectLobbyLoaded,
  logout,
};
