'use strict';

/**
 * Root Jest config — scopes Jest to server-side tests only.
 *
 * Client tests are written for Vitest and run via:
 *   npm test --prefix client   (or: cd client && npx vitest run)
 *
 * Server tests run via this config:
 *   npx jest                   (from repo root)
 *   npm run test:server        (npm test --prefix server)
 */
module.exports = {
  rootDir: 'server',
  moduleNameMapper: {
    '^poker-odds-calculator$': '<rootDir>/__mocks__/poker-odds-calculator.js',
  },
  testEnvironment: 'node',
  forceExit: true,
};
