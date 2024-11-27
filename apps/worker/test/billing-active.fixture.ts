import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  type Database,
  roomTypes,
  rooms,
  seats,
  stays,
  stayAssignments,
  inventoryClaims,
  stayHistory,
  hostelAuditLog,
} from '@hsm/db';
import type { BillingFixtureScope } from './billing.fixture.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Real occupancy sources for bounded Worker billing recovery, not HTTP admission acceptance.
export async function activateBillingFixture(tx: Transaction, s: BillingFixtureScope) {
  const roomTypeId = randomUUID(),
    roomId = randomUUID(),
    seatId = randomUUID();
  const assignmentId = randomUUID(),
    startedAt = new Date('2020-02-01T00:00:00Z');
  await tx.insert(roomTypes).values({
    id: roomTypeId,
    branchId: s.branchId,
    name: 'Recovery fixture',
    capacity: 1,
    inventoryMode: 'per_bed',
    bedMonthlyRentPaisa: 1800000n,
    depositPaisa: 0n,
  });
  await tx
    .insert(rooms)
    .values({ id: roomId, branchId: s.branchId, roomTypeId, label: roomId, status: 'active' });
  await tx.insert(seats).values({
    id: seatId,
    branchId: s.branchId,
    roomId,
    ordinal: 1,
    label: 'A',
    status: 'active',
  });
  await tx
    .update(stays)
    .set({ state: 'active', checkedInAt: startedAt, version: 2 })
    .where(eq(stays.id, s.stayId));
  await tx.insert(stayAssignments).values({
    id: assignmentId,
    branchId: s.branchId,
    stayId: s.stayId,
    roomTypeId,
    roomId,
    seatId,
    seatOrdinal: 1,
    startedAt,
    reason: 'Recovery fixture occupancy',
    createdByUserId: s.ownerId,
  });
  await tx.insert(inventoryClaims).values({
    branchId: s.branchId,
    roomId,
    seatId,
    seatOrdinal: 1,
    assignmentId,
    moveInDate: '2020-02-01',
    moveOutDate: '2020-03-01',
  });
  await tx.insert(stayHistory).values({
    branchId: s.branchId,
    stayId: s.stayId,
    actorUserId: s.ownerId,
    previousState: 'check_in_ready',
    nextState: 'active',
    reasonCode: 'fixture_check_in',
    detail: {},
  });
  await tx.insert(hostelAuditLog).values({
    organizationId: s.organizationId,
    branchId: s.branchId,
    actorUserId: s.ownerId,
    actorRole: 'owner',
    action: 'stay.checked_in',
    targetType: 'stay',
    targetId: s.stayId,
    after: { state: 'active' },
  });
}
