import { expect, it } from 'vitest';
import { installWebReporter, reportWebFailure } from './telemetry-reporter';
it('SEC-003: absent or failing observability does not escape the web error path', () => {
  expect(reportWebFailure()).toBeUndefined();
  let attempts = 0;
  const reset = installWebReporter(() => {
    attempts++;
    throw new Error('private-provider-response');
  });
  try {
    expect(reportWebFailure()).toBeUndefined();
    expect(attempts).toBe(1);
  } finally {
    reset();
  }
  expect(reportWebFailure()).toBeUndefined();
});
