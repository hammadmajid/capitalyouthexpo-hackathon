import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['*.spec.ts', '*.spec.mjs'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: [
        'security-audit-policy.ts',
        'dependency-integrity.ts',
        'coverage-lcov.ts',
        'coverage-inventory.ts',
        'coverage-gate.ts',
        'coverage-phase-two.ts',
        'coverage-provenance.ts',
        'coverage-discovery.ts',
        'coverage-reports.ts',
        'coverage-workspace.ts',
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
