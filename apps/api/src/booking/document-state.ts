import { ownerBookingDocumentSchema, ownBookingDocumentSchema } from '@hsm/contracts';
import type { bookingDocuments } from '@hsm/db';
type Document = typeof bookingDocuments.$inferSelect;
export function ownerDocumentState(row: Document) {
  return ownerBookingDocumentSchema.parse({
    id: row.id,
    branchId: row.branchId,
    bookingId: row.bookingId,
    kind: row.kind,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionCode: row.rejectionCode,
  });
}
export function ownDocumentState(row: Document) {
  return ownBookingDocumentSchema.parse({
    ...ownerDocumentState(row),
    fileId: row.fileId,
    consumedAt: row.consumedAt?.toISOString() ?? null,
  });
}
