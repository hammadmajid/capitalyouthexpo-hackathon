import { requireAdmissionStartingPeriods } from './resident-admission-starts.js';
import { z } from 'zod';
import { v7 } from 'uuid';
import { DomainError, manualStayInputSchema, stayIdentifierSchema } from '@hsm/contracts';
import {
  admissionActorScopeSchema,
  resolveResidentAdmissionParty,
} from './resident-admission-party.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { expireRoomReservations } from './inventory-expiry.js';
import { lockResidentAdmissionTarget } from './resident-admission-target.js';
import { requireResidentAdmissionAvailable } from './resident-admission-availability.js';
import { validateResidentAdmissionTerms } from './resident-admission-terms.js';
import {
  initializeAdmissionBilling,
  selectionSchema,
  requireCompleteSelection,
} from './resident-admission-billing.js';
import {
  writeManualAdmissionRecords,
  writeManualAdmissionHistory,
} from './resident-manual-admission-write.js';
import { enqueueResidentLifecycle } from './resident-lifecycle.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { protectedCnicSchema } from './resident-cnic.js';
import { activateBookingTransport } from './resident-booking-transport.js';
import { creditBookingPayment } from './resident-booking-credit.js';
const inputSchema = z
  .object({
    scope: admissionActorScopeSchema,
    manual: manualStayInputSchema,
    expectedUserId: stayIdentifierSchema.nullable(),
    initialBilling: z.array(selectionSchema).min(1).max(33),
    // CHG-054: protected CNIC for a new resident; the plain number never reaches this layer.
    cnic: protectedCnicSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.manual.resident.kind !== 'new' || value.manual.resident.profile.cnic === undefined,
    'A plain CNIC never reaches the database layer',
  )
  .refine(
    (value) => value.manual.resident.kind !== 'new' || value.expectedUserId === null,
    'A new manual relationship cannot invent an account link',
  );
type Input = z.infer<typeof inputSchema>;
export type ManualAdmissionAuthorizer = (
  tx: PostingTransaction,
  input: Input,
  now: Date,
) => Promise<void>;
export type AdmissionInput = Input;
export type ManualAdmissionContext = {
  input: Input;
  now: Date;
  target: Awaited<ReturnType<typeof lockResidentAdmissionTarget>>;
  admittedOn: string;
  party: Awaited<ReturnType<typeof resolveResidentAdmissionParty>>;
  stayId: string;
  agreementId: string;
  assignmentId: string;
  historyId: string;
  // STAY-001 / BKG-004: present only for confirmed-booking check-in lineage.
  booking: { id: string; snapshot: Record<string, unknown>; proofId: string | null } | null;
};
// STAY-001 / RES-001/004 / RENT-003/004 / AUD-004: internal transaction composer.
// Caller owns live authorized idempotency and sorted actor/linked identity locks.
// Required authorizer must prove live stay/rent/finance grants, exact current actor
// role and applicable branch admission requirements. No fallback or route exists.
export async function admitManualResident(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: ManualAdmissionAuthorizer,
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock);
  if (typeof authorize !== 'function')
    throw new DomainError('INTERNAL', 503, 'Admission authorization unavailable');
  await authorize(tx, input, now);
  const prepared = await prepareAdmission(tx, input, now);
  const party = await resolveResidentAdmissionParty(
    tx,
    {
      scope: input.scope,
      resident: input.manual.resident,
      expectedUserId: input.expectedUserId,
      ...(input.cnic ? { cnic: input.cnic } : {}),
    },
    now,
  );
  const context: ManualAdmissionContext = {
    input,
    now,
    ...prepared,
    party,
    stayId: v7(),
    agreementId: v7(),
    assignmentId: v7(),
    historyId: v7(),
    booking: null,
  };
  await finishAdmission(tx, context);
  return {
    stayId: context.stayId,
    residentId: party.residentId,
    agreementId: context.agreementId,
    assignmentId: context.assignmentId,
    state: 'active' as const,
    version: 1,
  };
}
export async function finishAdmission(tx: PostingTransaction, context: ManualAdmissionContext) {
  const { input, now } = context;
  await writeManualAdmissionRecords(tx, context);
  await activateBookingTransport(tx, context);
  await initializeAdmissionBilling(
    tx,
    {
      scope: { ...input.scope, stayId: context.stayId, agreementId: context.agreementId },
      selections: input.initialBilling,
    },
    now,
  );
  await creditBookingPayment(tx, context);
  await writeManualAdmissionHistory(tx, context);
  await enqueueResidentLifecycle(
    tx,
    { event: 'resident.admitted', stayId: context.stayId, historyId: context.historyId },
    now,
  );
}
export async function prepareAdmission(tx: PostingTransaction, input: Input, now: Date) {
  const hierarchy = await lockInventoryBranch(tx, input.scope.branchId);
  if (
    hierarchy.organization.id !== input.scope.organizationId ||
    [hierarchy.organization, hierarchy.brand, hierarchy.branch].some(
      (row) => row.archivedAt !== null,
    )
  )
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Admission branch unavailable');
  const target = await lockResidentAdmissionTarget(tx, {
    branchId: input.scope.branchId,
    target: input.manual.target,
  });
  const { admittedOn } = await requireResidentAdmissionAvailable(
    tx,
    {
      branchId: input.scope.branchId,
      target: input.manual.target,
      expectedLeaveDate: input.manual.period.expectedLeaveDate,
    },
    now,
  );
  if (input.manual.period.moveInDate > admittedOn)
    throw new DomainError('CONFLICT', 409, 'A future planned Stay cannot be actually admitted yet');
  await validateResidentAdmissionTerms(tx, {
    branchId: input.scope.branchId,
    brandId: hierarchy.brand.id,
    roomTypeId: target.roomTypeId,
    terms: input.manual.terms,
  });
  requireCompleteSelection(input.manual.terms, input.initialBilling);
  requireAdmissionStartingPeriods(
    { period: input.manual.period, terms: input.manual.terms, selections: input.initialBilling },
    admittedOn,
  );
  await expireRoomReservations(tx, target.roomId, now);
  return { target, admittedOn };
}
