import { expect, it } from 'vitest';
import { buildings, floors, rooms } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  lockBuilding,
  lockFloor,
  lockPropertyRoom,
  nextPropertyVersion,
  projectBuilding,
  projectFloor,
  readRoomLocation,
  requireActiveProperty,
} from './property-structure-state.js';
const branchId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const parent = '30000000-0000-4000-8000-000000000001';
const at = new Date('2026-06-26T07:00:00Z');
it('ACC-004 / AUD-010: metadata versions reject stale, exhausted and malformed facts', () => {
  expect(nextPropertyVersion(1, 1)).toBe(2);
  expect(() => nextPropertyVersion(2, 1)).toThrowError(
    expect.objectContaining({ code: 'PRECONDITION_FAILED' }),
  );
  expect(() => nextPropertyVersion(2147483647, 2147483647)).toThrowError(
    expect.objectContaining({ code: 'CONFLICT' }),
  );
  for (const value of [0, -1, 1.5, 2147483648, Number.NaN])
    expect(() => nextPropertyVersion(value, value)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  expect(requireActiveProperty(null)).toBeUndefined();
  expect(() => requireActiveProperty(at)).toThrowError(
    expect.objectContaining({ code: 'CONFLICT' }),
  );
});
it('PROP / AUD-010: strict public projections expose actual metadata and valid archive instants', () => {
  const building = {
    id,
    branchId,
    name: 'Main',
    sortOrder: 0,
    version: 1,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  };
  expect(projectBuilding(building)).toEqual({
    id,
    branchId,
    name: 'Main',
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  });
  const floor = {
    id,
    branchId,
    buildingId: parent,
    label: 'Ground',
    levelNumber: 0,
    version: 1,
    createdAt: at,
    updatedAt: at,
    archivedAt: at,
  };
  expect(projectFloor(floor)).toMatchObject({
    id,
    buildingId: parent,
    archivedAt: at.toISOString(),
  });
  expect(() => projectBuilding({ ...building, version: 0 })).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectFloor({ ...floor, archivedAt: new Date('invalid') })).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectFloor({ ...floor, label: '' })).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
});
it.each([
  { table: buildings, lock: lockBuilding },
  { table: floors, lock: lockFloor },
  { table: rooms, lock: lockPropertyRoom },
])(
  'SEC-003 / AUD-010: exact scoped object locks reject missing and foreign rows (%#)',
  async ({ table, lock }) => {
    const good = queryFixture();
    good.enqueue(table, [{ id, branchId }]);
    expect(await lock(good.transaction, branchId, id)).toMatchObject({ id, branchId });
    expect(good.locks).toEqual([{ table, mode: 'update' }]);
    for (const rows of [[], [{ id: parent, branchId }], [{ id, branchId: parent }]]) {
      const f = queryFixture();
      f.enqueue(table, rows);
      await expect(lock(f.transaction, branchId, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  },
);
it('PROP / AUD-010: room location preserves unknown, actual and archived metadata without invented parents', async () => {
  const row = {
    roomId: id,
    branchId,
    roomLabel: '101',
    version: 1,
    archivedAt: null,
    floorId: null,
    floorLabel: null,
    buildingId: null,
    buildingName: null,
  };
  const legacy = queryFixture();
  legacy.enqueue(rooms, [row]);
  expect(await readRoomLocation(legacy.transaction, branchId, id, true)).toMatchObject({
    floor: null,
    canEdit: true,
  });
  const located = queryFixture();
  located.enqueue(rooms, [
    {
      ...row,
      floorId: parent,
      floorLabel: 'Ground',
      buildingId: id,
      buildingName: 'Main',
      archivedAt: at,
    },
  ]);
  expect(await readRoomLocation(located.transaction, branchId, id, true)).toMatchObject({
    canEdit: false,
    floor: { id: parent, label: 'Ground', buildingId: id, buildingName: 'Main' },
  });
  for (const rows of [[], [{ ...row, branchId: parent }], [{ ...row, roomId: parent }]]) {
    const f = queryFixture();
    f.enqueue(rooms, rows);
    await expect(readRoomLocation(f.transaction, branchId, id, true)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  }
  const broken = queryFixture();
  broken.enqueue(rooms, [{ ...row, floorId: parent }]);
  await expect(readRoomLocation(broken.transaction, branchId, id, true)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
