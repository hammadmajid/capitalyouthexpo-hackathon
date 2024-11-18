import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    maxWorkers: 1,
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts', 'src/proxy.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
