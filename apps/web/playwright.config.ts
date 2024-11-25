import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['./src/server/private-browser-reporter.ts']],
  use: {
    browserName: 'chromium',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
