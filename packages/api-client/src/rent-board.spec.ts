import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readRentBoard } from './rent-board.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  stayId = '10000000-0000-4000-8000-000000000002';
const row = {
  stayId,
  residentId: stayId,
  displayName: 'R',
  stayState: 'active',
  roomLabel: null,
  bedLabel: null,
  state: 'not_billed',
  pendingProofs: 0,
  invoices: [],
};
const page = { branchId, month: '2026-10', data: [row], nextCursor: null };
function fixture(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
it('RB-004: reads the typed month route with bounded paging', async () => {
  const value = fixture(page);
  await expect(
    readRentBoard(value.client, branchId, { month: '2026-10', cursor: stayId }),
  ).resolves.toEqual(page);
  expect((value.fetch.mock.calls[0]?.[0] as Request).url).toBe(
    `https://api.example.test/v1/branches/${branchId}/rent-board?limit=20&month=2026-10&cursor=${stayId}`,
  );
  await expect(readRentBoard(value.client, branchId, { limit: 26 })).rejects.toThrow();
});
it.each([
  ['another branch', { ...page, branchId: stayId }, {}],
  ['another month', page, { month: '2026-11' }],
  ['duplicate Stays', { ...page, data: [row, row] }, {}],
  ['an oversized page', { ...page, data: [row, { ...row, stayId: branchId }] }, { limit: 1 }],
  ['a state not matching its invoices', { ...page, data: [{ ...row, state: 'overdue' }] }, {}],
])('RB-001 / SEC-003: rejects %s', async (_label, data, query) => {
  await expect(readRentBoard(fixture(data).client, branchId, query)).rejects.toThrow();
});
