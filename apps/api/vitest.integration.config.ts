import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'test/integration/**/*.spec.ts',
      'test/stack/**/*.spec.ts',
      'test/security/**/*.spec.ts',
      'test/concurrency/**/*.spec.ts',
    ],
    hookTimeout: 180000,
    testTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.xml' },
  },
});
