import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    fileParallelism: false,
    hookTimeout: 180000,
    testTimeout: 30000,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.xml' },
  },
});
