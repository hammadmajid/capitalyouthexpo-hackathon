import { expect, it } from 'vitest';
import { notificationJobSchema } from './contracts.js';
import { renderNotification } from './templates.js';
it('NTF-001 TRUST-002: verification event is worker-valid and template contains no internal decision details', () => {
  expect(
    notificationJobSchema.parse({
      event: 'owner.verification_updated',
      operationId: '10000000-0000-4000-8000-000000000001',
    }).event,
  ).toBe('owner.verification_updated');
  const result = renderNotification('owner.verification_updated');
  expect(result.title).toBe('Hostel verification updated');
  expect(result.data).toEqual({});
  expect(result.body).toContain('hostel setup');
});
