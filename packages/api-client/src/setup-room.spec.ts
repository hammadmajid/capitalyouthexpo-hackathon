import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { createSetupRoom } from './setup-room.js';
const branch = randomUUID(),
  floorId = randomUUID(),
  key = randomUUID();
function wire(response: object) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(response);
    },
  });
  return { client, requests };
}
it('CHG-057 / ROOM-002: creates room identity on its floor without fabricated beds or security', async () => {
  const result = { id: randomUUID(), branchId: branch, kind: 'room' },
    w = wire(result);
  expect(await createSetupRoom(w.client, branch, { label: '101', floorId }, key)).toEqual(result);
  const request = w.requests[0];
  expect(request?.headers.get('Idempotency-Key')).toBe(key);
  expect(request?.headers.get('X-CSRF-Token')).toBe('csrf');
  expect(await request?.json()).toEqual({ label: '101', floorId });
  expect(new URL(request?.url ?? '').pathname).toBe(`/v1/branches/${branch}/inventory/setup-rooms`);
});
it('CHG-057: rejects removed pricing/count fields before making a request', async () => {
  const w = wire({});
  for (const patch of [{ capacity: 4 }, { depositPaisa: 10 }, { monthlyRentPaisa: 10 }]) {
    await expect(
      createSetupRoom(w.client, branch, { label: '101', floorId, ...patch }, key),
    ).rejects.toThrow();
  }
  expect(w.requests).toHaveLength(0);
});
it.each([
  { branchId: randomUUID(), kind: 'room' },
  { branchId: branch, kind: 'seat' },
])('ACC-001: refuses a mismatched setup response %j', async (patch) => {
  const w = wire({ id: randomUUID(), ...patch });
  await expect(createSetupRoom(w.client, branch, { label: '101', floorId }, key)).rejects.toThrow();
});
