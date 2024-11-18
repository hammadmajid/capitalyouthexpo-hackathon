import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { decideCustomer, listGovernedCustomers } from './admin-customer-governance.js';
const id = '10000000-0000-4000-8000-000000000001',
  at = '2026-10-30T10:00:00.000Z';
it('HMA-015: exact customer decision preconditions and key survive the SDK boundary', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      Response.json({ userId: id, fullName: 'Customer', status: 'suspended', updatedAt: at }),
    );
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
    fetch,
  });
  const input = {
    action: 'suspend',
    reason: 'Confirmed repeated harassment',
    expectedStatus: 'active',
    expectedUpdatedAt: at,
  };
  await decideCustomer(client, id, input, id);
  const request = fetch.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('Idempotency-Key')).toBe(id);
  expect(await request.clone().json()).toEqual(input);
  expect(() => listGovernedCustomers(client, { limit: 51 })).toThrow();
  await expect(decideCustomer(client, id, { ...input, reason: 'short' }, id)).rejects.toThrow();
});
