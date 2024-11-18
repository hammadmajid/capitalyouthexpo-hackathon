import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    hookTimeout: 120000,
    testTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/seed.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
