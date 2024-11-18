import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ApiFailure, ClientFailure } from './result.js';
import {
  readInventoryPrices,
  scheduleInventoryPrice,
  RetainedInventoryPrice,
} from './inventory-pricing.js';
const branch = randomUUID(),
  type = randomUUID(),
  key = randomUUID();
const input = {
  effectiveFrom: '2026-10-25',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: null,
  depositPaisa: 0,
  fees: [{ code: 'mess' as const, cadence: 'monthly' as const, amountPaisa: 1 }],
};
const version = {
  ...input,
  id: randomUUID(),
  branchId: branch,
  roomTypeId: type,
  createdAt: '2026-10-25T10:00:00.000Z',
};
const history = { branchId: branch, roomTypeId: type, data: [version], nextCursor: null };
function fixture(value: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json(value);
    },
  });
  return { client, requests };
}
it('BKG-004: explicit effective date and exact paisa travel over the generated scoped route', async () => {
  const f = fixture(version);
  expect(await scheduleInventoryPrice(f.client, branch, type, input, key)).toEqual(version);
  expect(f.requests[0]?.url).toContain(`/branches/${branch}/inventory/room-types/${type}/prices`);
  expect(f.requests[0]?.headers.get('idempotency-key')).toBe(key);
  expect(await f.requests[0]?.json()).toEqual(input);
});
it.each([
  { branchId: randomUUID() },
  { roomTypeId: randomUUID() },
  { depositPaisa: 1 },
  { fees: [] },
  { effectiveFrom: '2026-10-26' },
])('ACC-004: a mismatched publication response fails closed (%j)', async (patch) => {
  await expect(
    scheduleInventoryPrice(fixture({ ...version, ...patch }).client, branch, type, input, key),
  ).rejects.toBeInstanceOf(ClientFailure);
});
it('ACC-004: current scoped history accepts first and older pages with exact continuation', async () => {
  const f = fixture({ ...history, nextCursor: input.effectiveFrom });
  expect(await readInventoryPrices(f.client, branch, type, { limit: 1 })).toEqual({
    ...history,
    nextCursor: input.effectiveFrom,
  });
  const older = { ...version, id: randomUUID(), effectiveFrom: '2026-10-24' };
  expect(
    (
      await readInventoryPrices(fixture({ ...history, data: [older] }).client, branch, type, {
        cursor: input.effectiveFrom,
      })
    ).data,
  ).toEqual([older]);
  expect(f.requests[0]?.url).toContain('limit=1');
  expect(
    (await readInventoryPrices(fixture({ ...history, data: [] }).client, branch, type)).data,
  ).toEqual([]);
});
it.each([
  { branchId: randomUUID() },
  { roomTypeId: randomUUID() },
  { data: [{ ...version, branchId: randomUUID() }] },
  { data: [{ ...version, roomTypeId: randomUUID() }] },
  { data: [version, { ...version, effectiveFrom: '2026-10-24' }] },
  { data: [version, { ...version, id: randomUUID(), effectiveFrom: '2026-10-26' }] },
  { nextCursor: '2026-10-24' },
  { data: [], nextCursor: input.effectiveFrom },
])(
  'ACC-004: foreign, duplicated, unordered or malformed history is rejected (%j)',
  async (patch) => {
    await expect(
      readInventoryPrices(fixture({ ...history, ...patch }).client, branch, type, { limit: 2 }),
    ).rejects.toBeInstanceOf(ClientFailure);
  },
);
it('ACC-004: history cannot repeat its cursor or exceed the requested bound', async () => {
  await expect(
    readInventoryPrices(fixture(history).client, branch, type, { cursor: input.effectiveFrom }),
  ).rejects.toBeInstanceOf(ClientFailure);
  await expect(
    readInventoryPrices(
      fixture({
        ...history,
        data: [version, { ...version, id: randomUUID(), effectiveFrom: '2026-10-24' }],
      }).client,
      branch,
      type,
      { limit: 1 },
    ),
  ).rejects.toBeInstanceOf(ClientFailure);
});
it('BKG-004: unknown result freezes original date, money, fees and key across retries', async () => {
  const execute = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValue(version),
    retained = new RetainedInventoryPrice(execute);
  await expect(retained.retry()).rejects.toThrow();
  await expect(retained.send(input, key)).rejects.toThrow('Offline');
  expect(retained.locked).toBe(true);
  expect(() => retained.reset()).toThrow();
  expect(() => retained.send(input, randomUUID())).toThrow();
  const sent = execute.mock.calls[0]?.[0] as typeof input;
  expect(Object.isFrozen(sent)).toBe(true);
  expect(Object.isFrozen(sent.fees)).toBe(true);
  expect(Object.isFrozen(sent.fees[0])).toBe(true);
  await retained.retry();
  expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0]);
  expect(retained.locked).toBe(false);
  expect(() => retained.send(input, key)).toThrow();
  retained.reset();
  await retained.send(input, randomUUID());
});
function denied(status: number) {
  return new ApiFailure({
    type: 'about:blank',
    title: 'Unavailable',
    status,
    code: 'FORBIDDEN',
    detail: 'Unavailable',
    traceId: randomUUID(),
  });
}
it('ACC-004: initial definite denial can be corrected; denial after unknown outcome retains the original command', async () => {
  const execute = vi
      .fn()
      .mockRejectedValueOnce(denied(403))
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockRejectedValueOnce(denied(403))
      .mockResolvedValue(version),
    retained = new RetainedInventoryPrice(execute);
  await expect(retained.send(input, key)).rejects.toBeInstanceOf(ApiFailure);
  expect(retained.locked).toBe(false);
  await expect(retained.send(input, randomUUID())).rejects.toThrow('Offline');
  await expect(retained.retry()).rejects.toBeInstanceOf(ApiFailure);
  expect(retained.locked).toBe(true);
  await retained.retry();
});
it('BKG-004: overlapping publications stay locked while the single original request is pending', async () => {
  let finish: ((value: unknown) => void) | undefined;
  const retained = new RetainedInventoryPrice(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    pending = retained.send(input, key);
  expect(retained.locked).toBe(true);
  await expect(retained.retry()).rejects.toThrow();
  expect(() => retained.reset()).toThrow();
  finish?.(version);
  await pending;
});
