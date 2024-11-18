import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
