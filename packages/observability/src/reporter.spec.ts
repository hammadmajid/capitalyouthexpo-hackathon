import { expect, it } from 'vitest';
import { safeReport } from './index.js';
it('SEC-003: provider failures never escape or reflect private exception text', () => {
  let delivered = 0;
  const online = safeReport(() => {
    delivered++;
    return 'provider-result';
  });
  expect(online()).toBeUndefined();
  expect(delivered).toBe(1);
  const offline = safeReport(() => {
    throw new Error('private-provider-response');
  });
  expect(offline()).toBeUndefined();
});
