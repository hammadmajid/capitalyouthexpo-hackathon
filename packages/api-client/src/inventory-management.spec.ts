import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  saveInventoryRoomType,
  createInventoryRoom,
  createInventoryBed,
  changeInventoryState,
  archiveInventory,
} from './inventory-management.js';
const branch = randomUUID(),
  target = randomUUID(),
  key = randomUUID();
const type = {
  name: 'Two beds',
  inventoryMode: 'both' as const,
  capacity: 2,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
};
function wire(kind: string, patch: Record<string, unknown> = {}) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json({ id: target, branchId: branch, kind, ...patch });
    },
  });
  function request() {
    const value = requests[0];
    if (!value) throw new Error('Missing request');
    return value;
  }
  return { client, requests, request };
}
it.each([false, true])(
  'BKG-004 / SEC-003: room type create/edit %s keeps exact prices and CSRF',
  async (edit) => {
    const value = wire('room_type');
    await saveInventoryRoomType(value.client, branch, type, key, edit ? target : undefined);
    expect(value.request().method).toBe(edit ? 'PUT' : 'POST');
    expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
    expect(value.request().headers.get('Idempotency-Key')).toBe(key);
    expect(await value.request().json()).toEqual(type);
    expect(new URL(value.request().url).pathname).toBe(
      `/v1/branches/${branch}/inventory/room-types` + (edit ? '/' + target : ''),
    );
  },
);
it('ACC-001: rooms and beds retain exact parent scope and server-assigned identity', async () => {
  const room = wire('room'),
    bed = wire('seat');
  await createInventoryRoom(
    room.client,
    branch,
    { roomTypeId: target, label: '101', status: 'active' },
    key,
  );
  await createInventoryBed(bed.client, branch, target, { label: 'A', status: 'active' }, key);
  expect(new URL(bed.request().url).pathname).toBe(
    `/v1/branches/${branch}/inventory/rooms/${target}/seats`,
  );
  expect(await bed.request().json()).toEqual({ label: 'A', status: 'active' });
});
it.each(['room', 'seat'] as const)(
  'ACC-001/004: %s status sends strict reason without force flags',
  async (kind) => {
    const value = wire(kind);
    await changeInventoryState(
      value.client,
      branch,
      kind,
      target,
      { status: 'maintenance', reason: ' Work ' },
      key,
    );
    expect(value.request().method).toBe('PUT');
    expect(await value.request().json()).toEqual({ status: 'maintenance', reason: 'Work' });
    expect(new URL(value.request().url).pathname).toBe(
      `/v1/branches/${branch}/inventory/${kind === 'room' ? 'rooms' : 'seats'}/${target}/status`,
    );
  },
);
it.each(['room_type', 'room', 'seat'] as const)(
  'ACC-004: %s archival uses explicit audited command',
  async (kind) => {
    const value = wire(kind);
    await archiveInventory(value.client, branch, kind, target, ' Retired ', key);
    expect(value.request().method).toBe('POST');
    expect(await value.request().json()).toEqual({ reason: 'Retired' });
    expect(new URL(value.request().url).pathname).toBe(
      `/v1/branches/${branch}/inventory/${{ room_type: 'room-types', room: 'rooms', seat: 'seats' }[kind]}/${target}/archive`,
    );
  },
);
it.each([{ branchId: randomUUID() }, { id: randomUUID() }, { kind: 'room' }])(
  'SEC-003: mismatched mutation response is rejected: %j',
  async (patch) => {
    const value = wire('seat', patch);
    await expect(
      archiveInventory(value.client, branch, 'seat', target, 'Retired', key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('SEC-003: malformed scope, prices, reason or client-assigned bed ordinal fail before IO', () => {
  const value = wire('room_type');
  expect(() =>
    saveInventoryRoomType(value.client, branch, { ...type, bedMonthlyRentPaisa: 1.5 }, key),
  ).toThrow();
  expect(() =>
    createInventoryRoom(
      value.client,
      'foreign',
      { roomTypeId: target, label: '1', status: 'active' },
      key,
    ),
  ).toThrow();
  expect(() =>
    createInventoryBed(
      value.client,
      branch,
      target,
      Object.assign({ label: 'A', status: 'active' as const }, { ordinal: 1 }),
      key,
    ),
  ).toThrow();
  expect(() => archiveInventory(value.client, branch, 'room', target, '', key)).toThrow();
  expect(value.requests).toHaveLength(0);
});
