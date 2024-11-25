import { expect, it } from 'vitest';
import { initializeBrowserTelemetry, reportBrowserFailure } from './telemetry-runtime';
it('SEC-003: optional browser initialization is idempotent and safe for error boundaries', () => {
  expect(initializeBrowserTelemetry()).toBeUndefined();
  expect(initializeBrowserTelemetry()).toBeUndefined();
  expect(reportBrowserFailure()).toBeUndefined();
});
