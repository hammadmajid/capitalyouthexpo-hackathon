import { expect, it } from 'vitest';
import { buildings, floors, residents, rooms } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { authorizeReportFilters } from './report-filter-scope.js';
const branch = '10000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000001';
const building = '30000000-0000-4000-8000-000000000001';
const floor = '40000000-0000-4000-8000-000000000001';
const room = '50000000-0000-4000-8000-000000000001';
const resident = '60000000-0000-4000-8000-000000000001';
it('SEC-003 / AUD-010: unfiltered and status-only reads require no identifier lookups', async () => {
  const s = queryFixture();
  await authorizeReportFilters(s.transaction, [], {});
  await authorizeReportFilters(s.transaction, [branch], { status: 'active' });
  expect(s.predicates).toEqual([]);
});
it('RPT-001 / AUD-010: compatible parents and a resident are accepted within one live branch', async () => {
  const s = queryFixture();
  s.enqueue(buildings, [{ id: building, branchId: branch }]);
  s.enqueue(floors, [{ id: floor, branchId: branch, buildingId: building }]);
  s.enqueue(rooms, [{ id: room, branchId: branch, floorId: floor }]);
  s.enqueue(residents, [{ id: resident, branchId: branch }]);
  await authorizeReportFilters(s.transaction, [branch, foreign], {
    buildingId: building,
    floorId: floor,
    roomId: room,
    residentId: resident,
  });
  expect(s.predicates).toHaveLength(4);
});
it.each([
  [buildings, { buildingId: building }],
  [floors, { floorId: floor }],
  [rooms, { roomId: room }],
  [residents, { residentId: resident }],
])('SEC-003 / AUD-010: missing selected identifiers are denied', async (_table, input) => {
  const s = queryFixture();
  await expect(authorizeReportFilters(s.transaction, [branch], input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('SEC-003 / AUD-010: foreign branch rows fail closed even if a query returns one', async () => {
  const s = queryFixture();
  s.enqueue(rooms, [{ id: room, branchId: foreign, floorId: null }]);
  await expect(
    authorizeReportFilters(s.transaction, [branch], { roomId: room }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('RPT-001 / AUD-010: a building and floor from different parents cannot be combined', async () => {
  const s = queryFixture();
  s.enqueue(buildings, [{ id: building, branchId: branch }]);
  s.enqueue(floors, [{ id: floor, branchId: branch, buildingId: foreign }]);
  await expect(
    authorizeReportFilters(s.transaction, [branch], { buildingId: building, floorId: floor }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('RPT-001 / AUD-010: unclassified legacy rooms cannot claim a selected floor', async () => {
  const s = queryFixture();
  s.enqueue(floors, [{ id: floor, branchId: branch, buildingId: building }]);
  s.enqueue(rooms, [{ id: room, branchId: branch, floorId: null }]);
  await expect(
    authorizeReportFilters(s.transaction, [branch], { floorId: floor, roomId: room }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('SEC-003 / AUD-010: owner multi-branch authority cannot combine unrelated branch identities', async () => {
  const s = queryFixture();
  s.enqueue(rooms, [{ id: room, branchId: branch, floorId: null }]);
  s.enqueue(residents, [{ id: resident, branchId: foreign }]);
  await expect(
    authorizeReportFilters(s.transaction, [branch, foreign], {
      roomId: room,
      residentId: resident,
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it.each([true, false])(
  'RPT-001 / AUD-010: building plus room checks its implicit floor (compatible=%s)',
  async (compatible) => {
    const s = queryFixture();
    s.enqueue(buildings, [{ id: building, branchId: branch }]);
    s.enqueue(rooms, [{ id: room, branchId: branch, floorId: floor }]);
    s.enqueue(floors, [
      { id: floor, branchId: branch, buildingId: compatible ? building : foreign },
    ]);
    const result = authorizeReportFilters(s.transaction, [branch], {
      buildingId: building,
      roomId: room,
    });
    if (compatible) await expect(result).resolves.toBe(branch);
    else await expect(result).rejects.toMatchObject({ code: 'NOT_FOUND' });
  },
);
it('RPT-001 / AUD-010: unknown implicit floor and unclassified legacy room cannot match a building', async () => {
  for (const floorId of [floor, null]) {
    const s = queryFixture();
    s.enqueue(buildings, [{ id: building, branchId: branch }]);
    s.enqueue(rooms, [{ id: room, branchId: branch, floorId }]);
    await expect(
      authorizeReportFilters(s.transaction, [branch], { buildingId: building, roomId: room }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
});
