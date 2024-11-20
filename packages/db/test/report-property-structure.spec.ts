import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { buildings, floors, rooms } from '../src/schema/index.js';
import { inventoryHarness } from './inventory.fixture.js';

const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('RPT-001 / AUD-010: real generated schema contains the baseline branch-scoped building/floor hierarchy', async () => {
  const [row] = await harness.database().execute(sql`
    select to_regclass('public.buildings')::text as buildings,
           to_regclass('public.floors')::text as floors
  `);
  expect(row).toEqual({ buildings: 'buildings', floors: 'floors' });
});
it('RPT-001 / AUD-010: real rooms can reference the floor needed by report predicates', async () => {
  const rows = await harness.database().execute(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'floor_id'
  `);
  expect([...rows]).toEqual([{ column_name: 'floor_id' }]);
});
it('SEC-003 / AUD-010: real composite foreign keys reject cross-branch floors and room links', async () => {
  const own = await harness.scope(),
    foreign = await harness.scope();
  const ownBuilding = randomUUID(),
    foreignBuilding = randomUUID(),
    foreignFloor = randomUUID();
  await harness
    .database()
    .insert(buildings)
    .values([
      { id: ownBuilding, branchId: own.branchId, name: 'Scoped building' },
      { id: foreignBuilding, branchId: foreign.branchId, name: 'Foreign building' },
    ]);
  await expect(
    harness.database().insert(floors).values({
      id: randomUUID(),
      branchId: own.branchId,
      buildingId: foreignBuilding,
      label: 'Invalid foreign parent',
      levelNumber: 1,
    }),
  ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23503' }) });
  await harness.database().insert(floors).values({
    id: foreignFloor,
    branchId: foreign.branchId,
    buildingId: foreignBuilding,
    label: 'Foreign floor',
    levelNumber: 1,
  });
  await expect(
    harness.database().update(rooms).set({ floorId: foreignFloor }).where(eq(rooms.id, own.roomId)),
  ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23503' }) });
});
it('PROP / RPT-001 / AUD-010: archived hierarchy keeps referenced rooms and legacy rooms remain unassigned', async () => {
  const scope = await harness.scope(),
    buildingId = randomUUID(),
    floorId = randomUUID();
  const [legacy] = await harness.database().select().from(rooms).where(eq(rooms.id, scope.roomId));
  expect(legacy?.floorId).toBeNull();
  await harness
    .database()
    .insert(buildings)
    .values({ id: buildingId, branchId: scope.branchId, name: 'Scoped building' });
  await harness
    .database()
    .insert(floors)
    .values({ id: floorId, branchId: scope.branchId, buildingId, label: 'Ground', levelNumber: 0 });
  await harness.database().update(rooms).set({ floorId }).where(eq(rooms.id, scope.roomId));
  await expect(
    harness.database().delete(floors).where(eq(floors.id, floorId)),
  ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23503' }) });
  await harness
    .database()
    .update(floors)
    .set({ archivedAt: new Date() })
    .where(eq(floors.id, floorId));
  await harness
    .database()
    .update(buildings)
    .set({ archivedAt: new Date() })
    .where(eq(buildings.id, buildingId));
  const [retained] = await harness
    .database()
    .select()
    .from(rooms)
    .where(eq(rooms.id, scope.roomId));
  expect(retained).toEqual({ ...legacy, floorId });
});
