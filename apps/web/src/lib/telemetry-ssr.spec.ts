// @vitest-environment node
import { expect, it } from 'vitest';
import { initializeBrowserTelemetry, reportBrowserFailure } from './telemetry-runtime';
it('SEC-003: server rendering cannot initialize or send browser telemetry', () => {
  expect(typeof window).toBe('undefined');
  expect(initializeBrowserTelemetry()).toBeUndefined();
  expect(reportBrowserFailure()).toBeUndefined();
});
