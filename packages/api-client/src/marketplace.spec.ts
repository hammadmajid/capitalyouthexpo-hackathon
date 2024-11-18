import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  listMarketplace,
  marketplaceInstitutions,
  listSavedHostels,
  saveHostel,
} from './marketplace.js';
const branchId = '019a1234-1234-7123-8123-123456789abc';
const key = randomUUID();
function firstRequest(requests: Request[]) {
  const request = requests[0];
  if (!request) throw new Error('Expected request missing');
  return request;
}
function fixture(response: unknown) {
  const requests: Request[] = [];
  const accessToken = vi.fn(async () => 'fixture-token');
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(response);
    },
  });
  return { client, requests, accessToken };
}
it('ACC-002: typed discovery serializes actual recent IDs and date filters', async () => {
  const wire = fixture({ data: [], nextCursor: null });
  expect(
    await listMarketplace(wire.client, {
      ids: [branchId],
      amenities: ['wifi'],
      availableOnly: true,
      moveInDate: '2026-10-15',
      moveOutDate: '2026-11-15',
    }),
  ).toEqual({ data: [], nextCursor: null });
  const url = new URL(firstRequest(wire.requests).url);
  expect(url.searchParams.get('ids')).toBe(branchId);
  expect(url.searchParams.get('amenities')).toBe('wifi');
  expect(url.searchParams.get('availableOnly')).toBe('true');
});
it('ACC-002: default discovery and institution projections validate rather than invent listings', async () => {
  const wire = fixture({ data: [], nextCursor: null });
  expect((await listMarketplace(wire.client)).data).toEqual([]);
  expect((await marketplaceInstitutions(wire.client)).data).toEqual([]);
  expect(new URL(firstRequest(wire.requests).url).searchParams.get('availableOnly')).toBe('false');
  expect(wire.accessToken).not.toHaveBeenCalled();
  expect(wire.requests.every((request) => !request.headers.has('Authorization'))).toBe(true);
});
it('ACC-002: Saved mutations carry exact branch, intent and idempotency key', async () => {
  const wire = fixture({ branchId, saved: false });
  expect(await saveHostel(wire.client, branchId, false, key)).toEqual({ branchId, saved: false });
  expect(firstRequest(wire.requests).headers.get('Idempotency-Key')).toBe(key);
  expect(firstRequest(wire.requests).headers.get('Authorization')).toBe('Bearer fixture-token');
  expect(await firstRequest(wire.requests).json()).toEqual({ saved: false });
  const page = fixture({ data: [], nextCursor: null });
  expect((await listSavedHostels(page.client)).data).toEqual([]);
});
it('ACC-002: malformed listing responses never reach the customer UI', async () => {
  const wire = fixture({ data: [{ customerName: 'private' }], nextCursor: null });
  await expect(listMarketplace(wire.client)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
