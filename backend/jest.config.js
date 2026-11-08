'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  testMatch: ['<rootDir>/tests/jest/**/*.test.js'],

  // Global setup/teardown: one MongoMemoryServer shared by all integration files
  globalSetup:    './tests/jest/setup/global-setup.js',
  globalTeardown: './tests/jest/setup/global-teardown.js',

  testTimeout: 60_000,

  // Coverage
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',    
  ],
  coverageReporters: ['lcov', 'text', 'text-summary'],
  coverageDirectory: 'coverage',

  maxWorkers: 1,
};
