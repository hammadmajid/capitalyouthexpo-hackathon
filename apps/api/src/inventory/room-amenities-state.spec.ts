import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { amenities, roomTypeAmenities, roomTypes } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  lockAmenityRoom,
  projectRoomAmenities,
  readRoomAmenities,
  requireRoomAmenityCodes,
} from './room-amenities-state.js';
const branchId = randomUUID(),
  roomTypeId = randomUUID(),
  wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true },
  retired = { code: 'retired', name: 'Retired', isActive: false };
it('ROOM-002 / ACC-004: exact active child lock rejects unknown or foreign room types', async () => {
  const store = queryFixture();
  store.enqueue(roomTypes, [{ id: roomTypeId }], []);
  await lockAmenityRoom(store.transaction, branchId, roomTypeId);
  expect(store.locks).toContainEqual({ table: roomTypes, mode: 'update' });
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing predicate');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.params).toEqual(expect.arrayContaining([branchId, roomTypeId]));
  expect(query.sql).toContain('"room_types"."archived_at" is null');
  await expect(lockAmenityRoom(store.transaction, branchId, roomTypeId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('ROOM-002: association reads are bounded, scoped and locked, with real empty selection allowed', async () => {
  const store = queryFixture();
  store.enqueue(roomTypeAmenities, [wifi], []);
  expect(await readRoomAmenities(store.transaction, branchId, roomTypeId)).toEqual([wifi]);
  expect(store.operations).toContainEqual({ table: roomTypeAmenities, kind: 'limit', args: [101] });
  expect(store.locks).toContainEqual({ table: roomTypeAmenities, mode: 'share' });
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing predicate');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual(
    expect.arrayContaining([branchId, roomTypeId]),
  );
  expect(await readRoomAmenities(store.transaction, branchId, roomTypeId)).toEqual([]);
});
it('ROOM-002: oversized stored associations fail rather than silently truncate', async () => {
  const store = queryFixture();
  store.enqueue(
    roomTypeAmenities,
    Array.from({ length: 101 }, (_, i) => ({ ...wifi, code: 'code_' + i })),
  );
  await expect(readRoomAmenities(store.transaction, branchId, roomTypeId)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('ROOM-002 / ACC-004: versions bind canonical scope, selected catalog metadata and current capability', () => {
  const state = projectRoomAmenities(branchId, roomTypeId, [wifi, retired], true);
  expect(
    projectRoomAmenities(branchId.toUpperCase(), roomTypeId.toUpperCase(), [retired, wifi], true),
  ).toEqual(state);
  for (const changed of [
    projectRoomAmenities(randomUUID(), roomTypeId, [wifi, retired], true),
    projectRoomAmenities(branchId, randomUUID(), [wifi, retired], true),
    projectRoomAmenities(branchId, roomTypeId, [wifi, retired], false),
    projectRoomAmenities(branchId, roomTypeId, [{ ...wifi, name: 'Changed' }, retired], true),
  ])
    expect(changed.version).not.toBe(state.version);
  expect(() => projectRoomAmenities(branchId, roomTypeId, [wifi, wifi], true)).toThrow();
  const privateRow = { ...wifi, customerId: randomUUID() };
  expect(() => projectRoomAmenities(branchId, roomTypeId, [privateRow], true)).toThrow();
});
it('ROOM-002: explicitly clearing a selection requires no invented catalog row', async () => {
  const store = queryFixture();
  await requireRoomAmenityCodes(store.transaction, { amenityCodes: [] }, [wifi]);
  expect(store.operations).toEqual([]);
});
it.each([
  { rows: [wifi], codes: ['wifi'], selected: [], allowed: true },
  { rows: [], codes: ['wifi'], selected: [], allowed: false },
  { rows: [retired], codes: ['retired'], selected: [], allowed: false },
  { rows: [retired], codes: ['retired'], selected: [retired], allowed: true },
])(
  'ROOM-002: active/unknown/retired catalog validation %#',
  async ({ rows, codes, selected, allowed }) => {
    const store = queryFixture();
    store.enqueue(amenities, rows);
    const command = requireRoomAmenityCodes(store.transaction, { amenityCodes: codes }, selected);
    if (allowed) await expect(command).resolves.toBeUndefined();
    else await expect(command).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(store.locks).toContainEqual({ table: amenities, mode: 'share' });
  },
);
