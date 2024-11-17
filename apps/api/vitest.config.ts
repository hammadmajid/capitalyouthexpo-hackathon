import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/api/**/*.spec.ts'],
    hookTimeout: 30000,
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 85,
        '**/visits/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/stay/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/management/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/files/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/idempotency/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/authorization/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/auth/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/services/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/admin/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        '**/insights/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
