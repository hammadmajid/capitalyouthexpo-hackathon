import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readBedHistory } from './bed-history.js';
import { readBranchOccupancy } from './occupancy.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  roomId = '10000000-0000-4000-8000-000000000002',
  bedId = '10000000-0000-4000-8000-000000000003';
const totals = { beds: 1, occupied: 0, blocked: 0, reserved: 0, unavailable: 0, available: 1 };
const room = {
  id: roomId,
  label: '101',
  roomTypeId: roomId,
  status: 'active',
  beds: [
    { id: bedId, label: 'A', ordinal: 1, status: 'active', state: 'available', occupant: null },
  ],
};
const page = { branchId, on: '2026-10-26', totals, data: [room], nextCursor: null };
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
it('BED-001: reads the typed occupancy route with bounded query parameters', async () => {
  const value = fixture(page);
  await expect(
    readBranchOccupancy(value.client, branchId, { on: '2026-10-26', limit: 5 }),
  ).resolves.toEqual(page);
  const request = value.fetch.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    `https://api.example.test/v1/branches/${branchId}/occupancy?limit=5&on=2026-10-26`,
  );
  await expect(readBranchOccupancy(value.client, 'bad')).rejects.toThrow();
  await expect(readBranchOccupancy(value.client, branchId, { limit: 51 })).rejects.toThrow();
});
it.each([
  ['another branch', { ...page, branchId: roomId }, {}],
  ['another date', page, { on: '2026-10-27' }],
  ['an oversized page', { ...page, data: [room, { ...room, id: bedId }] }, { limit: 1 }],
  ['rows before the cursor', page, { cursor: bedId }],
  [
    'an occupant on a free bed',
    {
      ...page,
      data: [
        { ...room, beds: [{ ...room.beds[0], occupant: { stayId: bedId, displayName: 'R' } }] },
      ],
    },
    {},
  ],
])('RES-004 / SEC-003: rejects %s', async (_label, data, query) => {
  await expect(readBranchOccupancy(fixture(data).client, branchId, query)).rejects.toThrow();
});

it('RES-005: historical reads preserve stay identity and reject foreign scope and broken cursors', async () => {
  const row = {
    assignmentId: roomId,
    stayId: roomId,
    residentName: 'Former resident',
    startedAt: '2026-10-26T10:00:00.000Z',
    endedAt: null,
    wholeRoom: false,
  };
  const data = { branchId, bedId, data: [row], nextCursor: null };
  await expect(readBedHistory(fixture(data).client, branchId, bedId)).resolves.toEqual(data);
  for (const invalid of [
    { ...data, branchId: roomId },
    { ...data, bedId: roomId },
    { ...data, nextCursor: '2026-10-25T10:00:00.000Z|' + bedId },
  ])
    await expect(readBedHistory(fixture(invalid).client, branchId, bedId)).rejects.toThrow();
  await expect(
    readBedHistory(fixture(data).client, branchId, bedId, {
      cursor: row.startedAt + '|' + row.assignmentId,
    }),
  ).rejects.toThrow();
});
