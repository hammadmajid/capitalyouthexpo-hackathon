import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  stays,
  stayAssignments,
  inventoryClaims,
  stayHistory,
  hostelAuditLog,
  residentBillingSchedules,
  notificationOutbox,
} from '../src/index.js';
import { financeScope, type FinanceScope } from './resident-finance.fixture.js';
import { billingScheduleFixture } from './resident-billing.fixture.js';
import type { inventoryHarness } from './inventory.fixture.js';
type Harness = ReturnType<typeof inventoryHarness>;
function dateInMonth(offset: number, day = 1) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day))
    .toISOString()
    .slice(0, 10);
}
export async function billingRuntimeFixture(
  harness: Harness,
  mode: 'normal' | 'zero' | 'manual' | 'stopped' | 'finite' = 'normal',
) {
  const period = {
    moveInDate:
      mode === 'manual'
        ? dateInMonth(-1, 10)
        : mode === 'finite'
          ? dateInMonth(-1)
          : dateInMonth(0),
    expectedLeaveDate: mode === 'finite' ? dateInMonth(0) : dateInMonth(3),
  };
  const setup =
    mode === 'zero'
      ? { rentAmountPaisa: 0 }
      : mode === 'manual'
        ? { proration: { kind: 'manual' as const } }
        : undefined;
  const scope = await financeScope(harness, setup, period);
  if (mode !== 'stopped') await activateFixture(harness, scope, period);
  const value = await harness.database().transaction(async (tx) => {
    const f = await billingScheduleFixture(
      tx,
      scope,
      mode === 'stopped' ? { state: 'stopped', currentJobId: null, nextRunAt: null } : {},
    );
    await tx.insert(residentBillingSchedules).values(f.value);
    const [message] = await tx
      .update(notificationOutbox)
      .set({
        status: 'pending',
        attempts: 1,
        leaseToken: f.leaseToken,
        leaseExpiresAt: new Date(f.now.getTime() + 60000),
      })
      .where(eq(notificationOutbox.id, f.jobId))
      .returning();
    if (!message) throw new Error('Billing lease fixture missing');
    return { message, scheduleId: f.value.id };
  });
  return { ...scope, ...value, period };
}
// Actual SQL occupancy dataset for a billing-command test, not HTTP admission acceptance.
async function activateFixture(
  harness: Harness,
  scope: FinanceScope,
  period: { moveInDate: string; expectedLeaveDate: string },
) {
  const checkedInAt = new Date(period.moveInDate + 'T00:00:00Z'),
    assignmentId = v7();
  await harness.database().transaction(async (tx) => {
    await tx
      .update(stays)
      .set({ state: 'active', checkedInAt, version: 2 })
      .where(eq(stays.id, scope.stayId));
    await tx.insert(stayAssignments).values({
      id: assignmentId,
      branchId: scope.branchId,
      stayId: scope.stayId,
      roomTypeId: scope.roomTypeId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      startedAt: checkedInAt,
      reason: 'Actual occupancy fixture',
      createdByUserId: scope.ownerId,
    });
    await tx.insert(inventoryClaims).values({
      branchId: scope.branchId,
      roomId: scope.roomId,
      seatId: scope.seatId,
      seatOrdinal: 1,
      assignmentId,
      moveInDate: period.moveInDate,
      moveOutDate: period.expectedLeaveDate,
    });
    await tx.insert(stayHistory).values({
      branchId: scope.branchId,
      stayId: scope.stayId,
      actorUserId: scope.ownerId,
      previousState: 'check_in_ready',
      nextState: 'active',
      reasonCode: 'fixture_check_in',
      detail: {},
    });
    await recordAdmissionAudit(tx, scope);
  });
}

async function recordAdmissionAudit(
  tx: Parameters<Parameters<ReturnType<Harness['database']>['transaction']>[0]>[0],
  scope: FinanceScope,
) {
  await tx.insert(hostelAuditLog).values({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    actorUserId: scope.ownerId,
    actorRole: 'owner',
    action: 'stay.checked_in',
    targetType: 'stay',
    targetId: scope.stayId,
    after: { state: 'active' },
  });
}
