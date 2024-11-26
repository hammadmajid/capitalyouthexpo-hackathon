const base = require('./jest.config.cjs');
// Supplemental evidence only; jest.config.cjs keeps its existing blocking thresholds.
module.exports = {
  ...base,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.{spec,test}.{ts,tsx,js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/__fixtures__/**',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage/aggregate-components',
  coverageReporters: ['lcov'],
  coverageThreshold: {},
};
