// @ts-check
const { test: setup } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { TEST_USERS, STORAGE_STATE_DIR, loginViaAPI } = require('./helpers/auth');

// Ensure the .auth directory exists
const authDir = path.join(__dirname, '.auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

/**
 * Auth setup — logs in as each test role and saves the browser context
 * (including sessionStorage with JWT) so subsequent tests skip the login step.
 *
 * Note: Playwright's storageState only persists cookies and localStorage by default.
 * Since this app uses sessionStorage, each test that needs auth will use the
 * loginViaAPI helper instead. This setup validates that test credentials work.
 */
setup('authenticate as coach', async ({ page }) => {
  const data = await loginViaAPI(page, TEST_USERS.coach);
  console.log(`  Coach login OK: ${data.name} (${data.role})`);

  // Save the JWT for other tests to reuse
  const state = { token: data.token, stableId: data.stableId, name: data.name, role: data.role };
  fs.writeFileSync(path.join(authDir, 'coach.json'), JSON.stringify(state, null, 2));
});

setup('authenticate as student', async ({ page }) => {
  const data = await loginViaAPI(page, TEST_USERS.student);
  console.log(`  Student login OK: ${data.name} (${data.role})`);

  const state = { token: data.token, stableId: data.stableId, name: data.name, role: data.role };
  fs.writeFileSync(path.join(authDir, 'student.json'), JSON.stringify(state, null, 2));
});

setup('authenticate as admin', async ({ page }) => {
  const data = await loginViaAPI(page, TEST_USERS.admin);
  console.log(`  Admin login OK: ${data.name} (${data.role})`);

  const state = { token: data.token, stableId: data.stableId, name: data.name, role: data.role };
  fs.writeFileSync(path.join(authDir, 'admin.json'), JSON.stringify(state, null, 2));
});

setup('authenticate as student2', async ({ page }) => {
  const data = await loginViaAPI(page, TEST_USERS.student2);
  console.log(`  Student2 login OK: ${data.name} (${data.role})`);

  const state = { token: data.token, stableId: data.stableId, name: data.name, role: data.role };
  fs.writeFileSync(path.join(authDir, 'student2.json'), JSON.stringify(state, null, 2));
});

setup('authenticate as student3', async ({ page }) => {
  const data = await loginViaAPI(page, TEST_USERS.student3);
  console.log(`  Student3 login OK: ${data.name} (${data.role})`);

  const state = { token: data.token, stableId: data.stableId, name: data.name, role: data.role };
  fs.writeFileSync(path.join(authDir, 'student3.json'), JSON.stringify(state, null, 2));
});
