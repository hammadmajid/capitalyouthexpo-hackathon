import { expect, it } from 'vitest';
import { installApiReporter, reportUnexpectedFailure } from './reporter.js';
it('SEC-003: absent or failing observability does not escape the API error path', () => {
  expect(reportUnexpectedFailure()).toBeUndefined();
  let attempts = 0;
  const reset = installApiReporter(() => {
    attempts++;
    throw new Error('private-provider-response');
  });
  try {
    expect(reportUnexpectedFailure()).toBeUndefined();
    expect(attempts).toBe(1);
  } finally {
    reset();
  }
  expect(reportUnexpectedFailure()).toBeUndefined();
});
