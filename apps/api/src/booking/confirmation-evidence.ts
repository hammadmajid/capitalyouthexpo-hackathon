import { and, eq } from 'drizzle-orm';
import { bookingDocuments, type bookings } from '@hsm/db';
import { DomainError, type BookingQuoteSnapshot } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
// SEC-003 / BKG-001: human approval cannot override an unclean or foreign private file.
export async function requireConfirmationEvidence(
  database: Transaction,
  booking: typeof bookings.$inferSelect,
  quote: BookingQuoteSnapshot,
  bucket?: string,
) {
  if (quote.policy.requiredDocuments.length === 0) return;
  if (!bucket) throw new DomainError('INTERNAL', 503, 'Document storage unavailable');
  const documents = await database
    .select({
      kind: bookingDocuments.kind,
      state: bookingDocuments.state,
      fileId: bookingDocuments.fileId,
    })
    .from(bookingDocuments)
    .where(
      and(
        eq(bookingDocuments.bookingId, booking.id),
        eq(bookingDocuments.branchId, booking.branchId),
        eq(bookingDocuments.customerUserId, booking.customerUserId),
      ),
    )
    .for('update');
  for (const kind of quote.policy.requiredDocuments) {
    const document = documents.find((item) => item.kind === kind);
    if (
      !document ||
      document.state === 'rejected' ||
      (quote.policy.documentReviewRequired && document.state !== 'accepted')
    )
      throw new DomainError('CONFLICT', 409, 'Required evidence is not accepted');
    const file = await ownedProfileAttachment(
      database,
      booking.customerUserId,
      bucket,
      document.fileId,
    );
    if (!file || file.purpose !== 'resident_document' || file.scanStatus !== 'clean')
      throw new DomainError('CONFLICT', 409, 'Required evidence is no longer available');
  }
}
