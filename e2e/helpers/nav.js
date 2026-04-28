// @ts-check
const { expect } = require('@playwright/test');

/**
 * Navigate to a page using the sidebar nav.
 * Uses the anchor title attribute which matches the label (NavLink renders as <a>).
 */
async function clickSideNav(page, label) {
  await page.locator(`nav a[title="${label}"]`).click();
}

/**
 * Assert that a sidebar nav item is visible.
 */
async function expectNavItem(page, label) {
  await expect(page.locator(`nav a[title="${label}"]`)).toBeVisible();
}

/**
 * Assert that a sidebar nav item is NOT visible (role-gated).
 */
async function expectNoNavItem(page, label) {
  await expect(page.locator(`nav a[title="${label}"]`)).not.toBeVisible();
}

/**
 * Wait for page content to load (no loading spinner).
 */
async function waitForPageLoad(page) {
  // Wait for any loading states to resolve
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

module.exports = {
  clickSideNav,
  expectNavItem,
  expectNoNavItem,
  waitForPageLoad,
};
