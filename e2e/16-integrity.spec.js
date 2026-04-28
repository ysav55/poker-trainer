// @ts-check
const base = require('@playwright/test');
const { test, expect } = require('./fixtures');

// ─── Group 1 & 2: Unauthenticated tests (use base test for plain `page` fixture) ──

base.test.describe('Login page (unauthenticated)', () => {

  // Issue 3: Login form inputs must have name, id, and autocomplete attributes
  base.test('login inputs have name, id, and autocomplete attributes', async ({ page }) => {
    await page.goto('/login');

    const nameInput = page.locator('input[placeholder="Enter your name"]');
    await expect(nameInput).toHaveAttribute('name', 'name');
    await expect(nameInput).toHaveAttribute('id', 'login-name');
    await expect(nameInput).toHaveAttribute('autocomplete', 'username');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute('name', 'password');
    await expect(passwordInput).toHaveAttribute('id', 'login-password');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  base.test('login form does not use method="get"', async ({ page }) => {
    await page.goto('/login');
    const form = page.locator('form');
    const method = await form.getAttribute('method');
    expect(method).not.toBe('get');
  });

  // Issue 2: Login page must not fire /api/tables before auth
  base.test('login page does not fire /api/tables request', async ({ page }) => {
    const tableRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/tables')) {
        tableRequests.push(req.url());
      }
    });

    await page.goto('/login');
    await page.waitForTimeout(2000);

    expect(tableRequests).toHaveLength(0);
  });
});

// ─── Group 3: Nav visibility per role ──────────────────────────────────────────

test.describe('Navigation visibility by role', () => {

  // Issue 4: solo_student must not see Tournaments or Staking in nav
  test('solo_student cannot see Tournaments or Staking', async ({ studentPage }) => {
    await studentPage.goto('/lobby');
    await studentPage.waitForSelector('nav');

    await expect(studentPage.locator('nav a[title="Tournaments"]')).toHaveCount(0);
    await expect(studentPage.locator('nav a[title="Staking"]')).toHaveCount(0);

    await expect(studentPage.locator('nav a[title="Lobby"]')).toBeVisible();
    await expect(studentPage.locator('nav a[title="History"]')).toBeVisible();
  });

  test('coach can see Tournaments and Staking', async ({ coachPage }) => {
    await coachPage.goto('/lobby');
    await coachPage.waitForSelector('nav');

    await expect(coachPage.locator('nav a[title="Tournaments"]')).toBeVisible();
    await expect(coachPage.locator('nav a[title="Staking"]')).toBeVisible();
  });
});

// ─── Group 4: Nav uses anchors, pages have h1 ──────────────────────────────────

test.describe('Navigation accessibility and page structure', () => {

  // Issue 5: Nav items must be <a> elements, not buttons
  test('nav items are <a> elements', async ({ studentPage }) => {
    await studentPage.goto('/lobby');
    await studentPage.waitForSelector('nav');

    const navButtons = studentPage.locator('nav button');
    await expect(navButtons).toHaveCount(0);

    const navLinks = studentPage.locator('nav a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  // Issue 6: Lobby page must have exactly one h1
  test('lobby page has exactly one h1', async ({ studentPage }) => {
    await studentPage.goto('/lobby');
    await studentPage.waitForSelector('nav');
    const h1s = studentPage.locator('h1');
    await expect(h1s).toHaveCount(1);
  });
});
