import { StaffService } from '../../src/staff/staff.service.js';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { branches, roomTypes, rooms, seats, managerAssignments } from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { insights } from '../../src/admin/factory.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
// Read-only queue acceptance uses real Postgres/Redis/auth/production Insights.
// Upload/scanner acceptance remains on the existing complete browser stack.
export async function dashboardQueuesFixture() {
  const now = new Date('2026-10-28T10:00:00Z');
  let staffRead: StaffService | undefined;
  const auth = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db, idempotency) => {
    staffRead = new StaffService(db, idempotency, () => now);
    return { insights: insights(db, () => now) };
  });
  try {
    if (!staffRead) throw new Error('Missing staff reader');
    const scope = await managementFixture(auth.connection.db, 'fixture-only-invitation-hash', now);
    await auth.connection.db
      .update(managerAssignments)
      .set({ status: 'active', activatedAt: now })
      .where(eq(managerAssignments.id, scope.assignmentId));
    const [base] = await auth.connection.db
      .select()
      .from(branches)
      .where(eq(branches.id, scope.branchA));
    if (!base) throw new Error('Missing queue branch fixture');
    const owner = await auth.service.issue(scope.ownerId, 'mobile');
    const manager = await auth.service.issue(scope.managerId, 'mobile');
    return {
      ...auth,
      staffRead,
      ...scope,
      organizationId: base.organizationId,
      base,
      now,
      customerA: scope.managerId,
      ownerHeaders: { authorization: 'Bearer ' + owner.accessToken },
      managerHeaders: { authorization: 'Bearer ' + manager.accessToken },
      async inventory() {
        const roomTypeId = randomUUID(),
          roomId = randomUUID(),
          seatId = randomUUID(),
          otherSeatId = randomUUID();
        await auth.connection.db.insert(roomTypes).values({
          id: roomTypeId,
          branchId: scope.branchA,
          name: 'Queue room',
          capacity: 2,
          inventoryMode: 'both',
          bedMonthlyRentPaisa: 1800001n,
          roomMonthlyRentPaisa: 3600002n,
          depositPaisa: 0n,
        });
        await auth.connection.db.insert(rooms).values({
          id: roomId,
          branchId: scope.branchA,
          roomTypeId,
          label: roomId,
          status: 'active',
        });
        await auth.connection.db.insert(seats).values([
          { id: seatId, branchId: scope.branchA, roomId, ordinal: 1, label: 'A', status: 'active' },
          {
            id: otherSeatId,
            branchId: scope.branchA,
            roomId,
            ordinal: 2,
            label: 'B',
            status: 'active',
          },
        ]);
        return { branchId: scope.branchA, roomTypeId, roomId, seatId, otherSeatId };
      },
    };
  } catch (error) {
    await auth.close();
    throw error;
  }
}
