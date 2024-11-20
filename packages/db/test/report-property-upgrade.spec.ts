import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { buildings, floors, rooms, roomTypes } from '../src/schema/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  previousPropertyMigrations,
  removePreviousPropertyMigrations,
  previousPropertyRoom,
  previousRooms,
  propertyMigrations,
} from './report-property-upgrade.fixture.js';

const h = inventoryHarness();
let folder: string | undefined;
beforeAll(async () => {
  folder = await previousPropertyMigrations();
  await h.start(folder);
});
afterAll(async () => {
  await h.close();
  if (folder) await removePreviousPropertyMigrations(folder);
});
it('ACC-006 / RPT-001 / AUD-010: additive upgrade preserves existing rooms and prices without invented locations', async () => {
  const scope = await previousPropertyRoom(h.database());
  const [before] = await h
    .database()
    .select()
    .from(previousRooms)
    .where(eq(previousRooms.id, scope.roomId));
  const [absent] = await h
    .database()
    .execute(sql`select to_regclass('public.buildings')::text as buildings`);
  expect(absent).toEqual({ buildings: null });
  await migrate(h.database(), { migrationsFolder: propertyMigrations });
  const [after] = await h.database().select().from(rooms).where(eq(rooms.id, scope.roomId));
  expect(after).toMatchObject({ ...before, floorId: null, locationVersion: 1 });
  expect(await h.database().select().from(buildings)).toEqual([]);
  expect(await h.database().select().from(floors)).toEqual([]);
  const [rent] = await h
    .database()
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, scope.roomTypeId));
  expect(rent).toMatchObject({ bedMonthlyRentPaisa: 123456n, depositPaisa: 12345n });
  // Re-running the migrator remains a no-op, not a backfill or duplicate hierarchy.
  await migrate(h.database(), { migrationsFolder: propertyMigrations });
  expect(await h.database().select().from(buildings)).toEqual([]);
});
