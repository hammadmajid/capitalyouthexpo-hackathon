import { defineConfig } from 'vitest/config';
import base from './vitest.integration.config.js';
// Additional whole-source evidence; original scoped coverage gates remain unchanged.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
      exclude: [
        'src/**/*.{spec,test}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
        'src/**/__tests__/**',
        'src/**/__fixtures__/**',
        'src/**/*.d.{ts,mts,cts}',
      ],
      reportsDirectory: 'coverage/aggregate-infrastructure',
      reporter: ['lcov'],
      thresholds: {},
    },
  },
});
