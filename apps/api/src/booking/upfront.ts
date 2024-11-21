import { and, desc, eq, inArray } from 'drizzle-orm';
import { bookingPaymentProofs, bookingUpfrontTerms, branchSettings, type bookings } from '@hsm/db';
import {
  DomainError,
  bookingUpfrontSchema,
  money,
  moneyToJson,
  upfrontAmountPaisa,
  type BookingQuoteSnapshot,
  type BookingUpfront,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Booking = typeof bookings.$inferSelect;
type Proof = typeof bookingPaymentProofs.$inferSelect;
export async function branchUpfrontRequirement(transaction: Transaction, branchId: string) {
  const [settings] = await transaction
    .select({ requirement: branchSettings.upfrontRequirement })
    .from(branchSettings)
    .where(eq(branchSettings.branchId, branchId));
  return settings?.requirement ?? 'none';
}
// BKG-004 / BKG-005: capture the requirement and amount from the request's own quote.
export async function captureUpfrontTerms(
  transaction: Transaction,
  booking: Pick<Booking, 'id' | 'branchId' | 'customerUserId'>,
  quote: BookingQuoteSnapshot,
  now: Date,
) {
  const requirement = await branchUpfrontRequirement(transaction, booking.branchId);
  const transport = quote.transportRequested
    ? BigInt(quote.transportOffer?.monthlyChargePaisa ?? 0)
    : 0n;
  if (requirement === 'none' && transport === 0n) return false;
  const amount =
    (requirement === 'none' ? 0n : upfrontAmountPaisa(requirement, quote.price)) + transport;
  if (amount <= 0n)
    throw new DomainError('CONFLICT', 409, 'The required upfront amount is not disclosed');
  await transaction.insert(bookingUpfrontTerms).values({
    bookingId: booking.id,
    branchId: booking.branchId,
    customerUserId: booking.customerUserId,
    requirement,
    amountPaisa: amount,
    // Instant mode has no staff approval step; payment opens immediately.
    approvedAt: quote.policy.bookingMode === 'instant' ? now : null,
    approvedByUserId: null,
    createdAt: now,
  });
  return true;
}
function projectProof(proof: Proof | undefined) {
  if (!proof) return null;
  return {
    id: proof.id,
    state: proof.state,
    amountPaisa: moneyToJson(money(proof.amountPaisa)),
    method: proof.method,
    paidOn: proof.paidOn,
    reference: proof.reference,
    submittedAt: proof.createdAt.toISOString(),
    reviewedAt: proof.reviewedAt?.toISOString() ?? null,
    reviewReason: proof.state === 'rejected' ? proof.reviewReason : null,
  };
}
// SRS v2.11: Approved → Payment Pending → Verification Pending → Confirmed.
export async function upfrontProjections(transaction: Transaction, bookingIds: string[]) {
  const result = new Map<string, BookingUpfront>();
  if (!bookingIds.length) return result;
  const terms = await transaction
    .select()
    .from(bookingUpfrontTerms)
    .where(inArray(bookingUpfrontTerms.bookingId, bookingIds));
  if (!terms.length) return result;
  const proofs = await transaction
    .select()
    .from(bookingPaymentProofs)
    .where(
      inArray(
        bookingPaymentProofs.bookingId,
        terms.map((row) => row.bookingId),
      ),
    )
    .orderBy(desc(bookingPaymentProofs.createdAt), desc(bookingPaymentProofs.id));
  for (const row of terms) {
    const proof = proofs.find((value) => value.bookingId === row.bookingId);
    const status = !row.approvedAt
      ? 'awaiting_approval'
      : !proof || proof.state === 'rejected'
        ? 'awaiting_payment'
        : proof.state === 'submitted'
          ? 'verification_pending'
          : 'verified';
    result.set(
      row.bookingId,
      bookingUpfrontSchema.parse({
        requirement: row.requirement,
        amountPaisa: moneyToJson(money(row.amountPaisa)),
        status,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        proof: projectProof(proof),
      }),
    );
  }
  return result;
}
// ACC-004: confirmation with a branch upfront requirement needs captured terms and an approved proof.
export async function requireVerifiedUpfront(transaction: Transaction, booking: Booking) {
  const [terms] = await transaction
    .select()
    .from(bookingUpfrontTerms)
    .where(eq(bookingUpfrontTerms.bookingId, booking.id))
    .for('update');
  if (!terms) {
    if ((await branchUpfrontRequirement(transaction, booking.branchId)) !== 'none')
      throw new DomainError(
        'CONFLICT',
        409,
        'This request has no captured upfront terms; the customer must submit a new request',
      );
    return undefined;
  }
  const [approved] = await transaction
    .select({ id: bookingPaymentProofs.id })
    .from(bookingPaymentProofs)
    .where(
      and(
        eq(bookingPaymentProofs.bookingId, booking.id),
        eq(bookingPaymentProofs.state, 'approved'),
      ),
    )
    .limit(1);
  if (!approved) throw new DomainError('CONFLICT', 409, 'Upfront payment is not verified');
  return terms;
}
