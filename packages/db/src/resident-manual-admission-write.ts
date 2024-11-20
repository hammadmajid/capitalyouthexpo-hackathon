import { v7 } from 'uuid';
import { availableTransportRouteIds, branchTransportBilling } from './transport-inclusion.js';
import {
  stays,
  stayAgreements,
  stayAssignments,
  inventoryClaims,
  stayHistory,
  hostelAuditLog,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import type { ManualAdmissionContext } from './resident-manual-admission.js';
export async function writeManualAdmissionRecords(
  tx: PostingTransaction,
  c: ManualAdmissionContext,
) {
  const { input, now } = c,
    scope = input.scope,
    period = input.manual.period;
  await tx.insert(stays).values({
    id: c.stayId,
    branchId: scope.branchId,
    residentId: c.party.residentId,
    userId: c.party.userId,
    bookingId: c.booking?.id ?? null,
    source: c.booking ? 'booking' : 'manual',
    state: 'active',
    version: 1,
    moveInDate: period.moveInDate,
    expectedLeaveDate: period.expectedLeaveDate,
    checkedInAt: now,
    closedAt: null,
    createdByUserId: scope.actorUserId,
    createdAt: now,
    updatedAt: now,
  });
  await writeAssignment(tx, c);
  await writeAgreement(tx, c);
  await writeClaim(tx, c);
}
async function writeAgreement(tx: PostingTransaction, c: ManualAdmissionContext) {
  const { input, now } = c,
    scope = input.scope,
    period = input.manual.period,
    terms = input.manual.terms;
  const transportBillingSnapshot = await branchTransportBilling(tx, scope.branchId, true);
  const includedTransportRouteIds =
    !c.booking && transportBillingSnapshot?.offer?.mode === 'included'
      ? await availableTransportRouteIds(tx, scope.branchId)
      : [];
  await tx.insert(stayAgreements).values({
    id: c.agreementId,
    branchId: scope.branchId,
    stayId: c.stayId,
    version: 1,
    effectiveFrom: period.moveInDate,
    policyVersionId: terms.policyVersionId,
    rentAmountPaisa: BigInt(terms.rentAmountPaisa),
    depositPaisa: BigInt(terms.depositPaisa),
    termsSnapshot: terms,
    includedTransportRouteIds: c.booking ? null : includedTransportRouteIds,
    transportBillingSnapshot,
    bookingSnapshot: c.booking?.snapshot ?? null,
    reason: c.booking ? 'Confirmed booking agreement' : 'Manual admission agreement',
    createdByUserId: scope.actorUserId,
    createdAt: now,
  });
}
async function writeAssignment(tx: PostingTransaction, c: ManualAdmissionContext) {
  const scope = c.input.scope;
  await tx.insert(stayAssignments).values({
    id: c.assignmentId,
    branchId: scope.branchId,
    stayId: c.stayId,
    roomTypeId: c.target.roomTypeId,
    roomId: c.target.roomId,
    seatId: c.target.seatId,
    seatOrdinal: c.target.seatOrdinal,
    startedAt: c.now,
    endedAt: null,
    reason: c.booking ? 'Confirmed booking check-in' : 'Manual admission',
    createdByUserId: scope.actorUserId,
    createdAt: c.now,
  });
}
async function writeClaim(tx: PostingTransaction, c: ManualAdmissionContext) {
  const scope = c.input.scope;
  await tx.insert(inventoryClaims).values({
    id: v7(),
    branchId: scope.branchId,
    roomId: c.target.roomId,
    seatId: c.target.seatId,
    seatOrdinal: c.target.seatOrdinal,
    assignmentId: c.assignmentId,
    moveInDate: c.admittedOn,
    moveOutDate: c.input.manual.period.expectedLeaveDate,
    expiresAt: null,
    releasedAt: null,
    createdAt: c.now,
  });
}
export async function writeManualAdmissionHistory(
  tx: PostingTransaction,
  c: ManualAdmissionContext,
) {
  const scope = c.input.scope;
  const detail = {
    residentId: c.party.residentId,
    userId: c.party.userId,
    assignmentId: c.assignmentId,
    agreementId: c.agreementId,
    source: c.booking ? 'booking' : 'manual',
    ...(c.booking ? { bookingId: c.booking.id, upfrontProofId: c.booking.proofId } : {}),
  };
  await tx.insert(stayHistory).values({
    id: c.historyId,
    branchId: scope.branchId,
    stayId: c.stayId,
    actorUserId: scope.actorUserId,
    previousState: null,
    nextState: 'active',
    reasonCode: c.booking ? 'booking_check_in' : 'manual_admission',
    detail,
    createdAt: c.now,
  });
  await tx.insert(hostelAuditLog).values({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    actorUserId: scope.actorUserId,
    actorRole: scope.actorRole,
    action: c.booking ? 'resident.booking.checked_in' : 'resident.manual.admitted',
    targetType: 'stay',
    targetId: c.stayId,
    after: { state: 'active', version: 1, ...detail, historyId: c.historyId },
    createdAt: c.now,
  });
}
