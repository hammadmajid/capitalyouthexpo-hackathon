import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import {
  DomainError,
  billingAgreementTermsSchema,
  bookingQuoteSnapshotSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import {
  bookingPaymentProofs,
  bookingUpfrontTerms,
  bookings,
  hostelAuditLog,
  inventoryClaims,
  residents,
  stays,
  users,
} from './schema/index.js';
import { admissionActorScopeSchema } from './resident-admission-party.js';
import { selectionSchema } from './resident-admission-billing.js';
import { lockInventoryBranch } from './inventory-lock.js';
import {
  finishAdmission,
  prepareAdmission,
  type AdmissionInput,
} from './resident-manual-admission.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { cnicColumns, protectedCnicSchema, type ProtectedCnic } from './resident-cnic.js';
const inputSchema = z
  .object({
    scope: admissionActorScopeSchema,
    bookingId: stayIdentifierSchema,
    terms: billingAgreementTermsSchema,
    initialBilling: z.array(selectionSchema).min(1).max(33),
    // CHG-054: typed at check-in only when the customer's account has no CNIC on file.
    cnic: protectedCnicSchema.nullable().optional(),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;
export type BookingCheckInAuthorizer = (
  tx: PostingTransaction,
  input: Input,
  customerUserId: string,
  now: Date,
) => Promise<void>;
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
async function lockConfirmedBooking(tx: PostingTransaction, input: Input) {
  const [booking] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.branchId, input.scope.branchId)))
    .for('update');
  if (!booking) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
  if (booking.state !== 'confirmed') conflict('Only a confirmed booking can be checked in');
  const [existing] = await tx
    .select({ id: stays.id })
    .from(stays)
    .where(eq(stays.bookingId, booking.id))
    .limit(1);
  if (existing) conflict('This booking is already checked in');
  return booking;
}
// BKG-008 / ACC-004: an upfront booking is admitted only with its approved proof; the proof
// is carried into the new Stay once as existing received money, never a second collection.
async function verifiedUpfrontProof(tx: PostingTransaction, bookingId: string) {
  const [terms] = await tx
    .select({ bookingId: bookingUpfrontTerms.bookingId })
    .from(bookingUpfrontTerms)
    .where(eq(bookingUpfrontTerms.bookingId, bookingId));
  if (!terms) return null;
  const [proof] = await tx
    .select({ id: bookingPaymentProofs.id })
    .from(bookingPaymentProofs)
    .where(
      and(
        eq(bookingPaymentProofs.bookingId, bookingId),
        eq(bookingPaymentProofs.state, 'approved'),
      ),
    );
  if (!proof) conflict('The booking upfront payment is not verified');
  return proof.id;
}
// RES-001: the booking Customer's own branch relationship, created once and linked only to
// the account that holds the confirmed booking. No contact matching or merging occurs.
async function bookingResident(
  tx: PostingTransaction,
  input: Input,
  customerUserId: string,
  now: Date,
) {
  const cnic = await residentCnic(tx, input, customerUserId);
  const [found] = await tx
    .select({
      id: residents.id,
      archivedAt: residents.archivedAt,
      cnicLast4: residents.cnicLast4,
    })
    .from(residents)
    .where(and(eq(residents.branchId, input.scope.branchId), eq(residents.userId, customerUserId)))
    .for('update');
  if (found) {
    if (found.archivedAt !== null) conflict('Resident relationship unavailable');
    if (found.cnicLast4 === null && cnic)
      await tx.update(residents).set(cnicColumns(cnic)).where(eq(residents.id, found.id));
    return found.id;
  }
  const [user] = await tx
    .select({ fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, customerUserId));
  if (!user) throw new DomainError('INTERNAL', 500, 'Booking customer unavailable');
  const id = v7();
  await tx.insert(residents).values({
    id,
    branchId: input.scope.branchId,
    userId: customerUserId,
    displayName: user.fullName.trim().slice(0, 120),
    phone: null,
    email: user.email,
    ...cnicColumns(cnic),
    createdByUserId: input.scope.actorUserId,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(hostelAuditLog).values({
    organizationId: input.scope.organizationId,
    branchId: input.scope.branchId,
    actorUserId: input.scope.actorUserId,
    actorRole: input.scope.actorRole,
    action: 'resident.relationship.created',
    targetType: 'resident',
    targetId: id,
    after: { residentId: id, accountLinked: true, bookingId: input.bookingId },
    createdAt: now,
  });
  return id;
}
// CHG-054: the account's own CNIC wins; a typed one is used only when none is on file.
async function residentCnic(
  tx: PostingTransaction,
  input: Input,
  customerUserId: string,
): Promise<ProtectedCnic | null> {
  const [user] = await tx
    .select({
      cnicHash: users.cnicHash,
      cnicEncrypted: users.cnicEncrypted,
      cnicLast4: users.cnicLast4,
    })
    .from(users)
    .where(eq(users.id, customerUserId));
  if (user?.cnicHash && user.cnicEncrypted && user.cnicLast4)
    return {
      cnicHash: user.cnicHash,
      cnicEncrypted: user.cnicEncrypted,
      cnicLast4: user.cnicLast4,
    };
  return input.cnic ?? null;
}
// BKG-004: the agreement must carry exactly the price captured when the booking was made.
function requireCapturedPrice(input: Input, quote: z.infer<typeof bookingQuoteSnapshotSchema>) {
  if (
    input.terms.rentAmountPaisa !== quote.price.monthlyRentPaisa ||
    input.terms.depositPaisa !== quote.price.depositPaisa ||
    JSON.stringify(input.terms.fees) !== JSON.stringify(quote.price.fees)
  )
    conflict('Admission terms must equal the booking captured price');
}
// STAY-001 / ACC-001 / BKG-009: confirmed booking → actual occupancy in one transaction.
// The reservation claim is released and the occupancy claim created under the same branch,
// booking and room locks, so no other admission can take the bed in between.
export async function checkInConfirmedBooking(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: BookingCheckInAuthorizer,
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock);
  if (typeof authorize !== 'function')
    throw new DomainError('INTERNAL', 503, 'Admission authorization unavailable');
  await lockInventoryBranch(tx, input.scope.branchId);
  const booking = await lockConfirmedBooking(tx, input);
  await authorize(tx, input, booking.customerUserId, now);
  const quote = bookingQuoteSnapshotSchema.parse(booking.quoteSnapshot);
  requireCapturedPrice(input, quote);
  const proofId = await verifiedUpfrontProof(tx, booking.id);
  const residentId = await bookingResident(tx, input, booking.customerUserId, now);
  await tx
    .update(inventoryClaims)
    .set({ releasedAt: now })
    .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt)));
  const admission: AdmissionInput = {
    scope: input.scope,
    manual: {
      resident: { kind: 'existing', residentId },
      target: quote.target,
      period: { moveInDate: quote.range.moveInDate, expectedLeaveDate: quote.range.moveOutDate },
      terms: input.terms,
    },
    expectedUserId: booking.customerUserId,
    initialBilling: input.initialBilling,
    cnic: null,
  };
  const prepared = await prepareAdmission(tx, admission, now);
  const context = {
    input: admission,
    now,
    ...prepared,
    party: {
      residentId,
      branchId: input.scope.branchId,
      userId: booking.customerUserId,
      displayName: '',
    },
    stayId: v7(),
    agreementId: v7(),
    assignmentId: v7(),
    historyId: v7(),
    booking: { id: booking.id, snapshot: booking.quoteSnapshot, proofId },
  };
  await finishAdmission(tx, context);
  return {
    stayId: context.stayId,
    residentId,
    agreementId: context.agreementId,
    assignmentId: context.assignmentId,
    bookingId: booking.id,
    state: 'active' as const,
    version: 1,
  };
}
