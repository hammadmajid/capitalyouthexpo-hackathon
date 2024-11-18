import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { createInventoryBed } from './inventory-management.js';
import { scheduleBedRent } from './bed-pricing.js';
const branch = randomUUID(),
  room = randomUUID(),
  bed = randomUUID(),
  key = randomUUID();
function wire(body: object) {
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
it.each([0, 100001])(
  'CHG-058: creating a bed preserves explicit security %i in the strict wire body',
  async (depositPaisa) => {
    const w = wire({ id: bed, branchId: branch, kind: 'seat' });
    await createInventoryBed(
      w.client,
      branch,
      room,
      { label: 'A', status: 'active', monthlyRentPaisa: 1800000, depositPaisa },
      key,
    );
    expect(await w.requests[0]?.json()).toEqual({
      label: 'A',
      status: 'active',
      monthlyRentPaisa: 1800000,
      depositPaisa,
    });
  },
);
it('CHG-058 / ACC-006: publishing security checks the returned amount and retained idempotency identity', async () => {
  const version = {
      id: randomUUID(),
      branchId: branch,
      roomId: room,
      bedId: bed,
      monthlyRentPaisa: 1800000,
      depositPaisa: 100001,
      effectiveFrom: '2026-11-21',
      createdAt: '2026-11-21T10:00:00Z',
    },
    w = wire(version);
  expect(
    await scheduleBedRent(
      w.client,
      branch,
      bed,
      { monthlyRentPaisa: 1800000, depositPaisa: 100001, effectiveFrom: version.effectiveFrom },
      key,
    ),
  ).toEqual(version);
  expect(w.requests[0]?.headers.get('Idempotency-Key')).toBe(key);
  await expect(
    scheduleBedRent(
      w.client,
      branch,
      bed,
      { monthlyRentPaisa: 1800000, depositPaisa: 200001, effectiveFrom: version.effectiveFrom },
      key,
    ),
  ).rejects.toThrow();
});
