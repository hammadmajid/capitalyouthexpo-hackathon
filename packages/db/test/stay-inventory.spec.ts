import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  inventoryClaims,
  inventoryBlocks,
  stays,
  stayAssignments,
  billingPolicies,
  stayAgreements,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
import { insertAssignment, closeAssignment } from './stay-assignment.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function active() {
  const scope = await financeScope(harness);
  await harness
    .database()
    .update(stays)
    .set({ state: 'active', checkedInAt: financeTime, version: 2 })
    .where(eq(stays.id, scope.stayId));
  return {
    scope,
    row: {
      id: v7(),
      branchId: scope.branchId,
      stayId: scope.stayId,
      roomTypeId: scope.roomTypeId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      startedAt: financeTime,
      reason: 'Actual assignment fixture',
      createdByUserId: scope.ownerId,
    },
  };
}
it('RES-004 / ACC-001: assignment without its exact canonical inventory claim rolls back', async () => {
  const { row } = await active();
  await expect(harness.database().insert(stayAssignments).values(row)).rejects.toThrow();
  expect(
    await harness.database().select().from(stayAssignments).where(eq(stayAssignments.id, row.id)),
  ).toHaveLength(0);
  await insertAssignment(harness.database(), row);
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, row.id));
  expect(claim?.moveInDate).toBe('2028-02-01');
  expect(claim?.moveOutDate).toBe('2028-03-01');
});
it('RES-004 / ACC-001: manual unavailable inventory and actual assignment share one exclusion domain', async () => {
  const { scope, row } = await active(),
    blockId = v7();
  await harness.database().transaction(async (transaction) => {
    await transaction.insert(inventoryBlocks).values({
      id: blockId,
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: null,
      moveInDate: '2028-02-10',
      moveOutDate: '2028-02-20',
      reason: 1,
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      blockId,
      moveInDate: '2028-02-10',
      moveOutDate: '2028-02-20',
    });
  });
  await expect(insertAssignment(harness.database(), row)).rejects.toThrow();
  expect(
    await harness.database().select().from(stayAssignments).where(eq(stayAssignments.id, row.id)),
  ).toHaveLength(0);
});
it('RES-004 / STAY-004: closing actual occupancy and releasing its claim must commit together', async () => {
  const { row } = await active(),
    endedAt = new Date('2028-02-10T06:00:00Z');
  await insertAssignment(harness.database(), row);
  await expect(
    harness
      .database()
      .update(inventoryClaims)
      .set({ releasedAt: endedAt })
      .where(eq(inventoryClaims.assignmentId, row.id)),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .update(stayAssignments)
      .set({ endedAt })
      .where(eq(stayAssignments.id, row.id)),
  ).rejects.toThrow();
  await closeAssignment(harness.database(), row.id, endedAt);
  const [saved] = await harness
    .database()
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.id, row.id));
  expect(saved?.endedAt).toEqual(endedAt);
});
it('RES-005 / ACC-001: extension replaces the reservation interval without rewriting actual assignment history', async () => {
  const { scope, row } = await active();
  await insertAssignment(harness.database(), row);
  const values = { expectedLeaveDate: '2028-04-01', version: 3 };
  await expect(
    harness.database().update(stays).set(values).where(eq(stays.id, scope.stayId)),
  ).rejects.toThrow();
  await harness.database().transaction(async (transaction) => {
    await transaction.update(stays).set(values).where(eq(stays.id, scope.stayId));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: new Date('2028-02-10T06:00:00Z') })
      .where(and(eq(inventoryClaims.assignmentId, row.id), isNull(inventoryClaims.releasedAt)));
    await transaction.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      assignmentId: row.id,
      moveInDate: '2028-02-01',
      moveOutDate: '2028-04-01',
    });
  });
  const history = await harness
    .database()
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.stayId, scope.stayId));
  expect(history).toHaveLength(1);
  expect(history[0]?.startedAt).toEqual(financeTime);
  expect(
    await harness
      .database()
      .select()
      .from(inventoryClaims)
      .where(eq(inventoryClaims.assignmentId, row.id)),
  ).toHaveLength(2);
});
it('RES-004 / RENT-003: open-ended occupancy requires explicit agreed policy and blocks arbitrarily later reservations', async () => {
  const { scope, row } = await active();
  await harness
    .database()
    .update(stays)
    .set({ expectedLeaveDate: null, version: 3 })
    .where(eq(stays.id, scope.stayId));
  await expect(insertAssignment(harness.database(), row)).rejects.toThrow();
  const [old] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, scope.agreementId));
  if (!old) throw new Error('Agreement fixture missing');
  const policyId = v7(),
    policy = { ...(old.termsSnapshot.policy as Record<string, unknown>), allowOpenEnded: true };
  await harness.database().transaction(async (transaction) => {
    await transaction
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.id, old.policyVersionId));
    await transaction.insert(billingPolicies).values({
      id: policyId,
      branchId: scope.branchId,
      policy,
      isCurrent: true,
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(stayAgreements).values({
      ...old,
      id: v7(),
      version: 2,
      policyVersionId: policyId,
      termsSnapshot: { ...old.termsSnapshot, policyVersionId: policyId, policy },
      reason: 'Explicit open-ended agreement',
    });
  });
  await insertAssignment(harness.database(), row);
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, row.id));
  expect(claim?.moveOutDate).toBeNull();
  await expect(
    harness.database().transaction(async (transaction) => {
      const blockId = v7();
      await transaction.insert(inventoryBlocks).values({
        id: blockId,
        branchId: scope.branchId,
        roomId: scope.roomId,
        seatId: scope.seatId,
        moveInDate: '2098-01-01',
        moveOutDate: '2098-02-01',
        reason: 1,
        createdByUserId: scope.ownerId,
      });
      await transaction.insert(inventoryClaims).values({
        blockId,
        branchId: scope.branchId,
        roomId: scope.roomId,
        seatId: scope.seatId,
        seatOrdinal: 1,
        moveInDate: '2098-01-01',
        moveOutDate: '2098-02-01',
      });
    }),
  ).rejects.toThrow();
});
