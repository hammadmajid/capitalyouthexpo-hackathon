import { randomUUID } from 'node:crypto';
import { inventoryClaims, residents, stayAssignments, stayHistory, stays } from '@hsm/db';
import type { phaseTwoFixture } from './phase-two-fixture.js';
type Fixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
type Scope = Awaited<ReturnType<Fixture['inventory']>>;
// CHG-040: a waiting list opens only when a current resident of the room type has given notice.
export async function giveNotice(f: Fixture, scope: Scope, requestedCheckoutDate = '2026-12-01') {
  const residentId = randomUUID(),
    stayId = randomUUID(),
    assignmentId = randomUUID();
  await f.connection.db.transaction(async (tx) => {
    await tx.insert(residents).values({
      id: residentId,
      branchId: scope.branchId,
      userId: null,
      displayName: 'Leaving Resident',
      phone: '+923001234567',
      email: 'leaving@example.com',
      createdByUserId: f.ownerId,
    });
    await tx.insert(stays).values({
      id: stayId,
      branchId: scope.branchId,
      residentId,
      userId: null,
      source: 'manual',
      state: 'notice_given',
      moveInDate: '2026-09-01',
      // A period before the fixture clock keeps this bed claim from changing today's availability.
      expectedLeaveDate: '2026-10-01',
      checkedInAt: new Date('2026-09-01T00:00:00+05:00'),
      createdByUserId: f.ownerId,
    });
    await tx.insert(stayAssignments).values({
      id: assignmentId,
      branchId: scope.branchId,
      stayId,
      roomTypeId: scope.roomTypeId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      startedAt: new Date('2026-09-01T00:00:00+05:00'),
      reason: 'Test resident on notice',
      createdByUserId: f.ownerId,
    });
    await tx.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      assignmentId,
      moveInDate: '2026-09-01',
      moveOutDate: '2026-10-01',
    });
    await tx.insert(stayHistory).values({
      id: randomUUID(),
      branchId: scope.branchId,
      stayId,
      actorUserId: f.ownerId,
      previousState: 'active',
      nextState: 'notice_given',
      reasonCode: 'notice_submitted',
      detail: { requestedCheckoutDate },
      createdAt: f.now,
    });
  });
  return stayId;
}
