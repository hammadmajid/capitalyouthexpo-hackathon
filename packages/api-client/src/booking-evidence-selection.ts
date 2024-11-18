import type { z } from 'zod';
import type { ownBookingDocumentSchema, BookingDocumentSubmission } from '@hsm/contracts';
type Evidence = z.infer<typeof ownBookingDocumentSchema>;
type Kind = BookingDocumentSubmission['kind'];
function reviewedFirst(left: Evidence, right: Evidence) {
  return (
    (right.reviewedAt ?? '').localeCompare(left.reviewedAt ?? '') ||
    right.state.localeCompare(left.state) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}
function finalReviews(rows: Evidence[]) {
  return rows.filter((row) => row.state !== 'pending').sort(reviewedFirst);
}
// Presentation hints from loaded private metadata. The server revalidates all evidence.
export function selectableBookingEvidence(
  rows: Evidence[],
  kind: Kind,
  reuse: boolean,
): Evidence[] {
  const matches = rows.filter((row) => row.kind === kind);
  return [...new Set(matches.map((row) => row.fileId))].flatMap((fileId) => {
    const versions = matches.filter((row) => row.fileId === fileId);
    const latest = finalReviews(versions)[0];
    if (latest?.state !== 'accepted') return [];
    const fresh = versions
      .filter((row) => row.state === 'accepted' && !row.bookingId && !row.consumedAt)
      .sort(reviewedFirst)[0];
    if (fresh?.reviewedAt && fresh.reviewedAt >= (latest.reviewedAt ?? '')) return [fresh];
    return reuse ? [latest] : [];
  });
}
export function bookingEvidenceReviewState(rows: Evidence[], kind: Kind, fileId: string) {
  const versions = rows.filter((row) => row.kind === kind && row.fileId === fileId);
  return finalReviews(versions)[0]?.state ?? (versions.length ? 'pending' : undefined);
}
