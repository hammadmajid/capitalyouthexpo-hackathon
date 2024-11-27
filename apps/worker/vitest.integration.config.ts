import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    hookTimeout: 180000,
    testTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.xml' },
  },
});
