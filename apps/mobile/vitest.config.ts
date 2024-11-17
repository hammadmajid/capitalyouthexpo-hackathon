import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.ts',
        'src/observability/runtime.ts',
        'scripts/native-diagnostics.ts',
        'scripts/native-report.ts',
        'scripts/native-ui.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/lib/runtime.ts', 'src/lib/secure-store.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
