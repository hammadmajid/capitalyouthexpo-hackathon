import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { scheduleBedRent, readBedRent } from './bed-pricing.js';
import { renameProperty } from './property-rename.js';
const branch = randomUUID(),
  room = randomUUID(),
  bed = randomUUID(),
  key = randomUUID();
const version = {
  id: randomUUID(),
  branchId: branch,
  roomId: room,
  bedId: bed,
  monthlyRentPaisa: 100001,
  effectiveFrom: '2026-11-20',
  createdAt: '2026-11-20T10:00:00Z',
};
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  return { client, requests };
}
it('CHG-056: sends exact physical-bed price, CSRF and retained idempotency identity', async () => {
  const w = wire(version);
  expect(
    await scheduleBedRent(
      w.client,
      branch,
      bed,
      { monthlyRentPaisa: 100001, effectiveFrom: version.effectiveFrom },
      key,
    ),
  ).toEqual(version);
  const request = w.requests[0];
  if (!request) throw new Error('Missing request');
  expect(new URL(request.url).pathname).toBe(`/v1/branches/${branch}/inventory/beds/${bed}/prices`);
  expect(request.headers.get('Idempotency-Key')).toBe(key);
  expect(request.headers.get('X-CSRF-Token')).toBe('csrf');
  expect(await request.json()).toEqual({
    monthlyRentPaisa: 100001,
    effectiveFrom: version.effectiveFrom,
  });
});
it.each([{ bedId: randomUUID() }, { branchId: randomUUID() }, { monthlyRentPaisa: 100002 }])(
  'ACC-001: rejects a mismatched price response %j',
  async (patch) => {
    const w = wire({ ...version, ...patch });
    await expect(
      scheduleBedRent(
        w.client,
        branch,
        bed,
        { monthlyRentPaisa: 100001, effectiveFrom: version.effectiveFrom },
        key,
      ),
    ).rejects.toThrow();
  },
);
it('ACC-001: history rejects a foreign room in a nested price version', async () => {
  const w = wire({
    branchId: branch,
    roomId: room,
    bedId: bed,
    bedLabel: 'A',
    canEdit: true,
    current: null,
    nextCursor: null,
    data: [{ ...version, roomId: randomUUID() }],
  });
  await expect(readBedRent(w.client, branch, bed)).rejects.toThrow();
});
it('ROOM-002: name edits retain expected old name and verify server identity', async () => {
  const w = wire({ id: bed, branchId: branch, kind: 'seat', name: 'Bed B' });
  await renameProperty(
    w.client,
    branch,
    'seat',
    bed,
    { name: ' Bed B ', expectedName: 'Bed A' },
    key,
  );
  const request = w.requests[0];
  if (!request) throw new Error('Missing request');
  expect(await request.json()).toEqual({ name: 'Bed B', expectedName: 'Bed A' });
  const wrong = wire({ id: randomUUID(), branchId: branch, kind: 'seat', name: 'Bed B' });
  await expect(
    renameProperty(
      wrong.client,
      branch,
      'seat',
      bed,
      { name: 'Bed B', expectedName: 'Bed A' },
      key,
    ),
  ).rejects.toThrow();
});
