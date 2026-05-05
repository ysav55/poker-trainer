// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_USERS, loginViaUI, expectLobbyLoaded } = require('./helpers/auth');

test.describe('Public Auth Flows', () => {

  // ─── US-1: User can view the login page ──────────────────────────────────────

  test('login page renders with correct elements', async ({ page }) => {
    await page.goto('/login');

    // Branding
    await expect(page.getByText('♠ POKER TRAINER')).toBeVisible();
    await expect(page.getByText("Texas Hold'em — Coach Platform")).toBeVisible();

    // Form elements
    await expect(page.getByPlaceholder('Enter your name')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();

    // Links
    await expect(page.getByTestId('forgot-password-link')).toBeVisible();
    await expect(page.getByTestId('register-link')).toBeVisible();
  });

  // ─── US-2: User can log in with valid credentials ────────────────────────────

  test('successful login navigates to lobby', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.coach);
    await expectLobbyLoaded(page);
  });

  // ─── US-3: Login fails with wrong credentials ────────────────────────────────

  test('invalid credentials show error message', async ({ page }) => {
    await loginViaUI(page, { name: 'NoSuchUser', password: 'badpassword1' });

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('login-error')).toContainText(/invalid|failed/i);
  });

  // ─── US-4: Login validates empty fields ───────────────────────────────────────

  test('empty name shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Password').fill('somepassword');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByTestId('login-error')).toContainText('Name is required');
  });

  test('empty password shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your name').fill('somename');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByTestId('login-error')).toContainText('Password is required');
  });

  // ─── US-5: Unauthenticated user is redirected to login ───────────────────────

  test('unauthenticated access to /lobby redirects to /login', async ({ page }) => {
    await page.goto('/lobby');
    await page.waitForURL('**/login');
    await expect(page.getByText('♠ POKER TRAINER')).toBeVisible();
  });

  test('unauthenticated access to /admin/crm redirects to /login', async ({ page }) => {
    await page.goto('/admin/crm');
    await page.waitForURL('**/login');
  });

  // ─── US-6: User can navigate to register page ────────────────────────────────

  test('register link navigates to registration page', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('register-link').click();
    await page.waitForURL('**/register');

    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  // ─── US-7: Register page shows student/coach tabs ────────────────────────────

  test('register page has student and coach tabs', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('button', { name: 'Student' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();

    // Student tab (default) — 3 fields
    await expect(page.getByPlaceholder('Your display name')).toBeVisible();
    await expect(page.getByPlaceholder('At least 8 characters')).toBeVisible();
    await expect(page.getByPlaceholder('Re-enter password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('register coach tab shows email field and approval notice', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Coach' }).click();

    await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request Coach Access' })).toBeVisible();
    await expect(page.getByText('admin approval')).toBeVisible();
  });

  // ─── US-8: Register form validates fields ─────────────────────────────────────

  test('register rejects mismatched passwords', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Your display name').fill('TestNewUser');
    await page.getByPlaceholder('At least 8 characters').fill('password123');
    await page.getByPlaceholder('Re-enter password').fill('different123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByTestId('register-error')).toContainText('do not match');
  });

  test('register rejects short password', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Your display name').fill('TestNewUser');
    await page.getByPlaceholder('At least 8 characters').fill('short');
    await page.getByPlaceholder('Re-enter password').fill('short');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByTestId('register-error')).toContainText('at least 8');
  });

  // ─── US-9: User can navigate to forgot password ──────────────────────────────

  test('forgot password page renders', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.getByText('Reset Password')).toBeVisible();
    await expect(page.getByPlaceholder('Your display name')).toBeVisible();
    await expect(page.getByRole('button', { name: /submit|request/i })).toBeVisible();
  });

  // ─── US-10: Login page links are navigable ────────────────────────────────────

  test('forgot password link navigates from login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('forgot-password-link').click();
    await page.waitForURL('**/forgot-password');
  });

  test('register page links back to login', async ({ page }) => {
    await page.goto('/register');
    await page.getByText('Sign in').click();
    await page.waitForURL('**/login');
  });
});
