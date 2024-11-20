import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { v7 } from 'uuid';
import {
  createDatabase,
  users,
  organizations,
  brands,
  branches,
  roomTypes,
  rooms,
  seats,
  bookingPolicies,
  bookings,
  inventoryClaims,
} from '../src/index.js';

export function inventoryHarness() {
  let container: StartedTestContainer | undefined;
  let connection: ReturnType<typeof createDatabase> | undefined;
  const database = () => {
    if (!connection) throw new Error('Inventory integration database unavailable');
    return connection.db;
  };
  return {
    database,
    async start(migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))) {
      const password = randomBytes(24).toString('hex');
      container = await new GenericContainer('postgis/postgis:17-3.5')
        .withEnvironment({
          POSTGRES_DB: 'inventory',
          POSTGRES_USER: 'inventory',
          POSTGRES_PASSWORD: password,
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start();
      connection = createDatabase(
        `postgres://inventory:${password}@${container.getHost()}:${container.getMappedPort(5432)}/inventory`,
      );
      await migrate(database(), {
        migrationsFolder,
      });
    },
    async close() {
      await connection?.close();
      await container?.stop();
    },
    async scope() {
      const ownerId = v7(),
        customerA = v7(),
        customerB = v7(),
        organizationId = v7(),
        brandId = v7();
      const branchId = v7(),
        roomTypeId = v7(),
        roomId = v7(),
        seatId = v7(),
        otherSeatId = v7(),
        policyId = v7();
      await database()
        .insert(users)
        .values(
          [ownerId, customerA, customerB].map((id) => ({ id, fullName: 'Inventory test fixture' })),
        );
      await database()
        .insert(organizations)
        .values({ id: organizationId, ownerUserId: ownerId, name: 'Inventory fixture' });
      await database()
        .insert(brands)
        .values({ id: brandId, organizationId, name: 'Inventory fixture' });
      await database().insert(branches).values({
        id: branchId,
        brandId,
        organizationId,
        name: 'Inventory fixture',
        slug: branchId,
      });
      await database().insert(roomTypes).values({
        id: roomTypeId,
        branchId,
        name: 'Two seats',
        capacity: 2,
        inventoryMode: 'both',
        bedMonthlyRentPaisa: 1800000n,
        roomMonthlyRentPaisa: 3200000n,
        depositPaisa: 1000000n,
      });
      await database()
        .insert(rooms)
        .values({ id: roomId, branchId, roomTypeId, label: '101', status: 'active' });
      await database()
        .insert(seats)
        .values([
          { id: seatId, branchId, roomId, ordinal: 1, label: 'A', status: 'active' },
          { id: otherSeatId, branchId, roomId, ordinal: 2, label: 'B', status: 'active' },
        ]);
      await database()
        .insert(bookingPolicies)
        .values({ id: policyId, branchId, policy: {}, isCurrent: false, createdByUserId: ownerId });
      return {
        ownerId,
        customerA,
        customerB,
        organizationId,
        brandId,
        branchId,
        roomTypeId,
        roomId,
        seatId,
        otherSeatId,
        policyId,
      };
    },
  };
}
export type InventoryFixture = Awaited<ReturnType<ReturnType<typeof inventoryHarness>['scope']>>;
export const stay = { moveInDate: '2027-01-01', moveOutDate: '2027-02-01' };
export function bookingValues(
  scope: InventoryFixture,
  patch: Partial<typeof bookings.$inferInsert> = {},
) {
  return {
    branchId: scope.branchId,
    roomId: scope.roomId,
    seatId: scope.seatId,
    customerUserId: scope.customerA,
    ...stay,
    state: 'confirmed' as const,
    policyVersionId: scope.policyId,
    quoteSnapshot: {
      price: { monthlyRentPaisa: 1800000 },
      policy: { requestReservesInventory: true },
    },
    ...patch,
    id: patch.id ?? v7(),
  };
}
export function claimValues(
  scope: InventoryFixture,
  source: { bookingId?: string; holdId?: string; blockId?: string },
  patch: Partial<typeof inventoryClaims.$inferInsert> = {},
) {
  return {
    branchId: scope.branchId,
    roomId: scope.roomId,
    seatId: scope.seatId,
    seatOrdinal: 1,
    ...stay,
    ...source,
    ...patch,
  };
}
