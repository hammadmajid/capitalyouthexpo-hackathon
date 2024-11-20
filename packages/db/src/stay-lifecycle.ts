import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import {
  databaseDateSchema,
  DomainError,
  stayCheckoutInputSchema,
  stayExtensionInputSchema,
  stayIdentifierSchema,
  stayTransferInputSchema,
} from '@hsm/contracts';
import {
  hostelAuditLog,
  inventoryClaims,
  notificationOutbox,
  residentBillingSchedules,
  stayAssignments,
  stayFinalStatements,
  stayHistory,
  stays,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { lockResidentAdmissionTarget } from './resident-admission-target.js';
import { requireResidentAdmissionAvailable } from './resident-admission-availability.js';
import { readStaySettlement } from './stay-settlement.js';
import { changeSchedule } from './stay-schedule-changes.js';
import { amendAgreementForTransfer } from './stay-repricing.js';
import { continueBillingAfterExtension } from './stay-billing-continuation.js';
import { applyDepositAtCheckout } from './stay-deposit-settlement.js';
import { closeTransportAtCheckout } from './stay-transport-close.js';
const OPEN = ['active', 'notice_given', 'checkout_pending'] as const;
export const lifecycleScopeSchema = z
  .object({
    organizationId: stayIdentifierSchema,
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    actorUserId: stayIdentifierSchema,
    actorRole: z.enum(['owner', 'manager']),
  })
  .strict();
type Scope = z.infer<typeof lifecycleScopeSchema>;
export type LifecycleAuthorizer = (tx: PostingTransaction, scope: Scope) => Promise<void>;
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
export function karachiDate(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
// Lock order shared with admission: branch inventory, then the Stay, then its assignment.
async function lockOpenStay(
  tx: PostingTransaction,
  scope: Scope,
  expectedVersion: number,
  authorize: LifecycleAuthorizer | undefined,
) {
  if (typeof authorize !== 'function')
    throw new DomainError('INTERNAL', 503, 'Lifecycle authorization unavailable');
  await lockInventoryBranch(tx, scope.branchId);
  await authorize(tx, scope);
  const [stay] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (!OPEN.some((state) => state === stay.state)) conflict('This Stay is already closed');
  if (stay.version !== expectedVersion) conflict('This Stay changed; reload before continuing');
  const [assignment] = await tx
    .select()
    .from(stayAssignments)
    .where(and(eq(stayAssignments.stayId, stay.id), isNull(stayAssignments.endedAt)))
    .for('update');
  if (!assignment) throw new DomainError('INTERNAL', 500, 'Stay occupancy unavailable');
  return { stay, assignment };
}
// An assignment period must have positive length (stay_assignments_period_check).
function requireAfter(start: Date, now: Date) {
  if (now <= start) conflict('The current assignment started at this instant; retry shortly');
}
async function history(
  tx: PostingTransaction,
  scope: Scope,
  states: { previous: string; next: string },
  reasonCode: string,
  detail: Record<string, unknown>,
  now: Date,
) {
  await tx.insert(stayHistory).values({
    branchId: scope.branchId,
    stayId: scope.stayId,
    actorUserId: scope.actorUserId,
    previousState: states.previous as typeof stays.$inferSelect.state,
    nextState: states.next as typeof stays.$inferSelect.state,
    reasonCode,
    detail,
    createdAt: now,
  });
  await tx.insert(hostelAuditLog).values({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    actorUserId: scope.actorUserId,
    actorRole: scope.actorRole,
    action: 'stay.' + reasonCode,
    targetType: 'stay',
    targetId: scope.stayId,
    after: detail,
    createdAt: now,
  });
}
// RES-005 / BED-003/004 / ACC-001: one transaction ends the old assignment, releases its
// claim and creates the new assignment and claim. P9-FIX-01: an explicitly agreed new rent
// amends the agreement in the same transaction, so occupancy and price commit together.
export async function transferStay(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: LifecycleAuthorizer,
) {
  const input = z
    .object({ scope: lifecycleScopeSchema, transfer: stayTransferInputSchema })
    .strict()
    .parse(value);
  const now = z.date().parse(clock),
    { scope, transfer } = input;
  if (transfer.effectiveAt !== undefined && new Date(transfer.effectiveAt) > now)
    conflict('A transfer takes effect when it is recorded');
  const { stay, assignment } = await lockOpenStay(tx, scope, transfer.expectedVersion, authorize);
  const target = await lockResidentAdmissionTarget(tx, {
    branchId: scope.branchId,
    target: transfer.target,
  });
  if (target.roomId === assignment.roomId && target.seatId === assignment.seatId)
    conflict('The resident is already assigned there');
  requireAfter(assignment.startedAt, now);
  await tx
    .update(stayAssignments)
    .set({ endedAt: now })
    .where(eq(stayAssignments.id, assignment.id));
  await tx
    .update(inventoryClaims)
    .set({ releasedAt: now })
    .where(
      and(eq(inventoryClaims.assignmentId, assignment.id), isNull(inventoryClaims.releasedAt)),
    );
  await requireResidentAdmissionAvailable(
    tx,
    {
      branchId: scope.branchId,
      target: transfer.target,
      expectedLeaveDate: stay.expectedLeaveDate,
    },
    now,
  );
  const toAssignmentId = v7();
  await tx.insert(stayAssignments).values({
    id: toAssignmentId,
    branchId: scope.branchId,
    stayId: stay.id,
    roomTypeId: target.roomTypeId,
    roomId: target.roomId,
    seatId: target.seatId,
    seatOrdinal: target.seatOrdinal,
    startedAt: now,
    endedAt: null,
    reason: transfer.reason,
    createdByUserId: scope.actorUserId,
    createdAt: now,
  });
  await tx.insert(inventoryClaims).values({
    id: v7(),
    branchId: scope.branchId,
    roomId: target.roomId,
    seatId: target.seatId,
    seatOrdinal: target.seatOrdinal,
    assignmentId: toAssignmentId,
    moveInDate: karachiDate(now),
    moveOutDate: stay.expectedLeaveDate,
    expiresAt: null,
    releasedAt: null,
    createdAt: now,
  });
  const agreement = transfer.repricing
    ? await amendAgreementForTransfer(
        tx,
        scope,
        {
          rentAmountPaisa: transfer.repricing.rentAmountPaisa,
          reason: transfer.reason,
          today: karachiDate(now),
        },
        now,
      )
    : null;
  await history(
    tx,
    scope,
    { previous: stay.state, next: stay.state },
    'transfer',
    {
      fromAssignmentId: assignment.id,
      toAssignmentId,
      reason: transfer.reason,
      agreementId: agreement?.agreementId ?? null,
    },
    now,
  );
  return {
    stayId: stay.id,
    fromAssignmentId: assignment.id,
    toAssignmentId,
    roomId: target.roomId,
    bedId: target.seatId,
    transferredAt: now.toISOString(),
    agreement,
  };
}
// OUT / STAY: extend (or shorten) the expected departure. The claim period moves with it,
// so the exclusion constraint rejects an extension that overlaps a reservation or block.
export async function extendStay(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: LifecycleAuthorizer,
) {
  const input = z
    .object({ scope: lifecycleScopeSchema, extension: stayExtensionInputSchema })
    .strict()
    .parse(value);
  const now = z.date().parse(clock),
    { scope, extension } = input;
  const { stay, assignment } = await lockOpenStay(tx, scope, extension.expectedVersion, authorize);
  if (extension.expectedLeaveDate <= karachiDate(now))
    conflict('The new departure date must be in the future');
  if (extension.expectedLeaveDate === stay.expectedLeaveDate) conflict('The date is unchanged');
  const version = stay.version + 1;
  await tx
    .update(stays)
    .set({ expectedLeaveDate: extension.expectedLeaveDate, version, updatedAt: now })
    .where(eq(stays.id, stay.id));
  // Claim terms are immutable: release the live claim and issue its replacement with the
  // same start and the new end, so exactly one live claim remains for the assignment.
  const [current] = await tx
    .update(inventoryClaims)
    .set({ releasedAt: now })
    .where(and(eq(inventoryClaims.assignmentId, assignment.id), isNull(inventoryClaims.releasedAt)))
    .returning();
  if (!current) throw new DomainError('INTERNAL', 500, 'Stay occupancy claim unavailable');
  await tx.insert(inventoryClaims).values({
    id: v7(),
    branchId: current.branchId,
    roomId: current.roomId,
    seatId: current.seatId,
    seatOrdinal: current.seatOrdinal,
    assignmentId: assignment.id,
    moveInDate: current.moveInDate,
    moveOutDate: extension.expectedLeaveDate,
    expiresAt: null,
    releasedAt: null,
    createdAt: now,
  });
  await history(
    tx,
    scope,
    { previous: stay.state, next: stay.state },
    'extension',
    { from: stay.expectedLeaveDate, to: extension.expectedLeaveDate, reason: extension.reason },
    now,
  );
  // P9-FIX-02: billing follows the new date inside the same transaction.
  const billing = await continueBillingAfterExtension(tx, scope, karachiDate(now), now);
  return { stayId: stay.id, version, expectedLeaveDate: extension.expectedLeaveDate, billing };
}
// RENT-004 / AUD-004: stop recurring work through the audited human schedule change the
// database guard requires; pending jobs then complete as obsolete.
async function stopSchedules(tx: PostingTransaction, scope: Scope, now: Date) {
  const schedules = await tx
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.stayId, scope.stayId),
        inArray(residentBillingSchedules.state, ['active', 'manual_required']),
      ),
    )
    .for('update');
  for (const schedule of schedules) await changeSchedule(tx, scope, schedule, 'stopped', now);
}
// OUT-003..006 / ACC-001: checkout freezes the settlement statement, stops billing, ends
// the assignment and releases its claim in one transaction. Outstanding balances and credit
// remain as records; held deposit is applied only when the authorized request asks for it.
export async function checkoutStay(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: LifecycleAuthorizer,
) {
  const input = z
    .object({ scope: lifecycleScopeSchema, checkout: stayCheckoutInputSchema })
    .strict()
    .parse(value);
  const now = z.date().parse(clock),
    { scope, checkout } = input;
  const { stay, assignment } = await lockOpenStay(tx, scope, checkout.expectedVersion, authorize);
  requireAfter(assignment.startedAt, now);
  // P9-FIX-03: the authorized deposit application commits with the checkout or not at all.
  const depositApplied = checkout.applyAvailableDeposit
    ? await applyDepositAtCheckout(
        tx,
        {
          branchId: scope.branchId,
          stayId: stay.id,
          actorUserId: scope.actorUserId,
          actorRole: scope.actorRole,
        },
        { today: karachiDate(now), reason: checkout.reason },
        now,
      )
    : [];
  const statement = await readStaySettlement(tx, {
    branchId: scope.branchId,
    stayId: stay.id,
    today: karachiDate(now),
  });
  await stopSchedules(tx, scope, now);
  await closeTransportAtCheckout(tx, scope, karachiDate(now), now);
  await tx
    .update(stayAssignments)
    .set({ endedAt: now })
    .where(eq(stayAssignments.id, assignment.id));
  await tx
    .update(inventoryClaims)
    .set({ releasedAt: now })
    .where(
      and(eq(inventoryClaims.assignmentId, assignment.id), isNull(inventoryClaims.releasedAt)),
    );
  await tx
    .update(stays)
    .set({ state: 'completed', closedAt: now, version: stay.version + 1, updatedAt: now })
    .where(eq(stays.id, stay.id));
  const statementId = v7(),
    closed = { ...statement, stayState: 'completed' as const };
  await tx.insert(stayFinalStatements).values({
    id: statementId,
    branchId: scope.branchId,
    stayId: stay.id,
    snapshot: closed,
    createdByUserId: scope.actorUserId,
    createdAt: now,
  });
  await history(
    tx,
    scope,
    { previous: stay.state, next: 'completed' },
    'checkout',
    { assignmentId: assignment.id, statementId, reason: checkout.reason, depositApplied },
    now,
  );
  if (stay.userId !== null)
    await tx.insert(notificationOutbox).values({
      eventType: 'notification.create',
      channel: 'in_app',
      recipientUserId: stay.userId,
      payload: { event: 'resident.checked_out', operationId: statementId },
      dedupeKey: 'in_app:' + stay.userId + ':resident.checked_out:' + statementId,
      createdAt: now,
      nextAttemptAt: now,
    });
  return {
    stayId: stay.id,
    state: 'completed' as const,
    closedAt: now.toISOString(),
    statementId,
    statement: closed,
    depositApplied,
  };
}
