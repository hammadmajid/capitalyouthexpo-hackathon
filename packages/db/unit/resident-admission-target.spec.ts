import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { rooms, roomTypes, seats } from '../src/schema/index.js';
import { lockResidentAdmissionTarget } from '../src/resident-admission-target.js';
import {
  targetFixture as fixture,
  targetIds as ids,
  targetInput as input,
  targetRoom as room,
  targetType as type,
  targetSeat as seat,
} from './resident-admission-target.fixture.js';
it('STAY-001 / RES-004: operational target normalizes exact IDs and locks room/type/bed without a public listing requirement', async () => {
  const f = fixture();
  expect(
    await lockResidentAdmissionTarget(f.tx, {
      branchId: ids.branch.toUpperCase(),
      target: { ...input.target, bedId: ids.seat.toUpperCase() },
    }),
  ).toEqual({
    branchId: ids.branch,
    roomTypeId: ids.type,
    roomId: ids.room,
    seatId: ids.seat,
    seatOrdinal: 1,
  });
  expect(f.locks).toEqual([
    { table: rooms, mode: 'update' },
    { table: roomTypes, mode: 'update' },
    { table: seats, mode: 'update' },
  ]);
  const dialect = new PgDialect();
  expect(f.predicates.map((row) => dialect.sqlToQuery(row.value).params)).toEqual([
    [ids.branch, ids.room],
    [ids.branch, ids.type],
    [ids.branch, ids.room, ids.seat],
  ]);
  expect(f.limits).toEqual([]);
});
it.each(['both', 'whole_room'])(
  'RES-004: %s whole-room target has no synthetic bed and uses bounded unavailable-bed existence',
  async (inventoryMode) => {
    const f = fixture({ types: [{ ...type, inventoryMode }], seats: [] });
    expect(
      await lockResidentAdmissionTarget(f.tx, {
        branchId: ids.branch,
        target: { kind: 'room', roomId: ids.room },
      }),
    ).toEqual({
      branchId: ids.branch,
      roomTypeId: ids.type,
      roomId: ids.room,
      seatId: null,
      seatOrdinal: null,
    });
    expect(f.locks.map((row) => row.table)).toEqual([rooms, roomTypes]);
    expect(f.limits).toEqual([1]);
    const predicate = f.predicates.at(-1);
    if (!predicate) throw Error('Existence predicate missing');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
      ids.branch,
      ids.room,
      'inactive',
      'maintenance',
    ]);
  },
);
it.each([
  { kind: 'bed', mode: 'whole_room' },
  { kind: 'room', mode: 'per_bed' },
])('RES-004: $kind cannot bypass configured $mode inventory mode', async ({ kind, mode }) => {
  const f = fixture({ types: [{ ...type, inventoryMode: mode }] }),
    target = kind === 'bed' ? input.target : { kind: 'room', roomId: ids.room };
  await expect(
    lockResidentAdmissionTarget(f.tx, { branchId: ids.branch, target }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  expect(f.predicates).toHaveLength(2);
});
it.each([
  { options: { rooms: [] }, code: 'NOT_FOUND' },
  { options: { rooms: [{ ...room, id: randomUUID() }] }, code: 'INTERNAL' },
  { options: { rooms: [{ ...room, branchId: randomUUID() }] }, code: 'INTERNAL' },
  { options: { rooms: [{ ...room, id: 'bad' }] }, code: 'INTERNAL' },
  { options: { rooms: [{ ...room, status: 'inactive' }] }, code: 'CONFLICT' },
  { options: { rooms: [{ ...room, status: 'maintenance' }] }, code: 'CONFLICT' },
  { options: { rooms: [{ ...room, archivedAt: new Date() }] }, code: 'CONFLICT' },
  { options: { rooms: [{ ...room, status: 'unknown' }] }, code: 'INTERNAL' },
  { options: { types: [] }, code: 'INTERNAL' },
  { options: { types: [{ ...type, id: randomUUID() }] }, code: 'INTERNAL' },
  { options: { types: [{ ...type, branchId: randomUUID() }] }, code: 'INTERNAL' },
  { options: { types: [{ ...type, inventoryMode: 'unknown' }] }, code: 'INTERNAL' },
  { options: { types: [{ ...type, capacity: 0 }] }, code: 'INTERNAL' },
  { options: { types: [{ ...type, archivedAt: new Date() }] }, code: 'CONFLICT' },
  { options: { seats: [] }, code: 'NOT_FOUND' },
  { options: { seats: [{ ...seat, id: randomUUID() }] }, code: 'INTERNAL' },
  { options: { seats: [{ ...seat, branchId: randomUUID() }] }, code: 'INTERNAL' },
  { options: { seats: [{ ...seat, roomId: randomUUID() }] }, code: 'INTERNAL' },
  { options: { seats: [{ ...seat, ordinal: 0 }] }, code: 'INTERNAL' },
  { options: { seats: [{ ...seat, ordinal: 3 }] }, code: 'INTERNAL' },
  { options: { seats: [{ ...seat, status: 'maintenance' }] }, code: 'CONFLICT' },
  { options: { seats: [{ ...seat, status: 'inactive' }] }, code: 'CONFLICT' },
  { options: { seats: [{ ...seat, archivedAt: new Date() }] }, code: 'CONFLICT' },
])(
  'SEC-003 / ACC-001: missing, foreign, corrupt or offline target %# is not accepted',
  async ({ options, code }) => {
    await expect(lockResidentAdmissionTarget(fixture(options).tx, input)).rejects.toMatchObject({
      code,
    });
  },
);
it('RES-004: whole room refuses one unavailable live bed without loading the bed directory', async () => {
  const f = fixture({ seats: [{ id: ids.seat }] });
  await expect(
    lockResidentAdmissionTarget(f.tx, {
      branchId: ids.branch,
      target: { kind: 'room', roomId: ids.room },
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Room contains unavailable inventory' });
  expect(f.limits).toEqual([1]);
});
it.each([
  { branchId: 'bad' },
  { target: { ...input.target, bedId: 'bad' } },
  { target: { kind: 'seat', roomId: ids.room } },
  { actorRole: 'owner' },
])('SEC-003: malformed/injected target %# fails before database scope reads', async (patch) => {
  const f = fixture();
  await expect(lockResidentAdmissionTarget(f.tx, { ...input, ...patch })).rejects.toThrow();
  expect(f.predicates).toEqual([]);
  expect(f.locks).toEqual([]);
});
