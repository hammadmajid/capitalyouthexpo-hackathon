import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { roomTypeAmenities } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { publicRoomAmenities } from './room-amenities.js';
const branchId = randomUUID(),
  first = randomUUID(),
  second = randomUUID();
it('ROOM-002: empty room options require no association query and invent no amenity', async () => {
  const store = queryFixture();
  expect(await publicRoomAmenities(store.transaction, branchId, [])).toEqual(new Map());
  expect(store.operations).toEqual([]);
});
it('ROOM-002 / ACC-002: one bounded query binds all actual room types to active approved catalog names only', async () => {
  const store = queryFixture();
  store.enqueue(roomTypeAmenities, [
    { roomTypeId: first, code: 'wifi', name: 'Wi-Fi', occupantId: randomUUID() },
    { roomTypeId: second, code: 'heater', name: 'Heater' },
  ]);
  const result = await publicRoomAmenities(store.transaction, branchId, [first, second]);
  expect(result.get(first)).toEqual([{ code: 'wifi', name: 'Wi-Fi' }]);
  expect(result.get(second)).toEqual([{ code: 'heater', name: 'Heater' }]);
  expect(store.operations.filter((operation) => operation.kind === 'limit')).toEqual([
    { table: roomTypeAmenities, kind: 'limit', args: [201] },
  ]);
  expect(store.predicates).toHaveLength(1);
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing predicate');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual(
    expect.arrayContaining([branchId, first, second, true]),
  );
  expect(store.operations.filter((operation) => operation.kind === 'innerJoin')).toHaveLength(1);
});
it('ROOM-002: no stored active association remains a genuine empty result', async () => {
  const store = queryFixture();
  store.enqueue(roomTypeAmenities, []);
  expect(await publicRoomAmenities(store.transaction, branchId, [first])).toEqual(new Map());
});
it.each([
  { rows: [{ roomTypeId: randomUUID(), code: 'wifi', name: 'Wi-Fi' }] },
  { rows: [{ roomTypeId: first, code: 'WiFi', name: 'Wi-Fi' }] },
  { rows: [{ roomTypeId: first, code: 'wifi' }] },
  {
    rows: [
      { roomTypeId: first, code: 'wifi', name: 'Wi-Fi' },
      { roomTypeId: first, code: 'wifi', name: 'Wi-Fi' },
    ],
  },
  {
    rows: Array.from({ length: 101 }, (_, i) => ({
      roomTypeId: first,
      code: 'code_' + i,
      name: 'Approved amenity',
    })),
  },
])(
  'ACC-002 / SEC-003: corrupt, mismatched or oversized metadata %# fails closed',
  async ({ rows }) => {
    const store = queryFixture();
    store.enqueue(roomTypeAmenities, rows);
    await expect(publicRoomAmenities(store.transaction, branchId, [first])).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
  },
);
it('ROOM-002: per-type bound is enforced even when the complete batch remains below its total bound', async () => {
  const store = queryFixture();
  store.enqueue(
    roomTypeAmenities,
    Array.from({ length: 101 }, (_, i) => ({
      roomTypeId: first,
      code: 'code_' + i,
      name: 'Approved amenity',
    })),
  );
  await expect(
    publicRoomAmenities(store.transaction, branchId, [first, second]),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
it.each([{ ids: [first, first] }, { ids: ['invalid'] }])(
  'ACC-002: duplicate/invalid source type IDs %# cannot dispatch a query',
  async ({ ids }) => {
    const store = queryFixture();
    await expect(publicRoomAmenities(store.transaction, branchId, ids)).rejects.toThrow();
    expect(store.operations).toEqual([]);
  },
);
