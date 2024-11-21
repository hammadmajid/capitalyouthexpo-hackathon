import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { bookingDocuments } from '@hsm/db';
import { DomainError, type CreateBookingInput, type BookingQuoteSnapshot } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
type Evidence = CreateBookingInput['documents'][number];
export type PreparedEvidence = Evidence & {
  state: 'pending' | 'accepted';
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  sourceDocumentId: string | null;
};
export async function selectEvidence(
  database: Transaction,
  actor: Actor,
  branchId: string,
  policy: BookingQuoteSnapshot['policy'],
  input: Evidence,
): Promise<PreparedEvidence> {
  const scope = and(
    eq(bookingDocuments.customerUserId, actor.userId),
    eq(bookingDocuments.branchId, branchId),
    eq(bookingDocuments.kind, input.kind),
    eq(bookingDocuments.fileId, input.fileId),
  );
  const [latest] = await database
    .select()
    .from(bookingDocuments)
    .where(
      and(
        scope,
        or(eq(bookingDocuments.state, 'accepted'), eq(bookingDocuments.state, 'rejected')),
      ),
    )
    .orderBy(
      desc(bookingDocuments.reviewedAt),
      desc(bookingDocuments.state),
      desc(bookingDocuments.createdAt),
      desc(bookingDocuments.id),
    )
    .limit(1)
    .for('update');
  if (latest?.state === 'rejected')
    throw new DomainError('CONFLICT', 409, 'Evidence requires new Owner verification');
  const [fresh] = await database
    .select()
    .from(bookingDocuments)
    .where(
      and(
        scope,
        eq(bookingDocuments.state, 'accepted'),
        isNull(bookingDocuments.bookingId),
        isNull(bookingDocuments.consumedAt),
      ),
    )
    .orderBy(
      desc(bookingDocuments.reviewedAt),
      desc(bookingDocuments.createdAt),
      desc(bookingDocuments.id),
    )
    .limit(1)
    .for('update');
  const accepted =
    fresh?.reviewedAt && (!latest?.reviewedAt || fresh.reviewedAt >= latest.reviewedAt)
      ? fresh
      : policy.allowEvidenceReuse && latest?.state === 'accepted'
        ? latest
        : undefined;
  if (accepted) {
    if (!accepted.reviewedAt || !accepted.reviewedByUserId)
      throw new DomainError('CONFLICT', 409, 'Evidence review provenance unavailable');
    return {
      ...input,
      state: 'accepted',
      reviewedAt: accepted.reviewedAt,
      reviewedByUserId: accepted.reviewedByUserId,
      sourceDocumentId: !accepted.bookingId && !accepted.consumedAt ? accepted.id : null,
    };
  }
  if (policy.documentReviewRequired && policy.bookingMode === 'instant')
    throw new DomainError(
      'CONFLICT',
      409,
      'Required evidence must be reviewed before instant confirmation',
    );
  const [pending] = await database
    .select({ id: bookingDocuments.id })
    .from(bookingDocuments)
    .where(
      and(
        scope,
        eq(bookingDocuments.state, 'pending'),
        isNull(bookingDocuments.bookingId),
        isNull(bookingDocuments.consumedAt),
      ),
    )
    .orderBy(desc(bookingDocuments.createdAt), desc(bookingDocuments.id))
    .limit(1)
    .for('update');
  return {
    ...input,
    state: 'pending',
    reviewedAt: null,
    reviewedByUserId: null,
    sourceDocumentId: pending?.id ?? null,
  };
}
export async function consumeEvidence(
  database: Transaction,
  actor: Actor,
  branchId: string,
  evidence: PreparedEvidence[],
  now: Date,
) {
  const sources = [
    ...new Set(evidence.flatMap((item) => (item.sourceDocumentId ? [item.sourceDocumentId] : []))),
  ];
  for (const id of sources) {
    const rows = await database
      .update(bookingDocuments)
      .set({ consumedAt: now })
      .where(
        and(
          eq(bookingDocuments.id, id),
          eq(bookingDocuments.customerUserId, actor.userId),
          eq(bookingDocuments.branchId, branchId),
          isNull(bookingDocuments.bookingId),
          isNull(bookingDocuments.consumedAt),
          or(eq(bookingDocuments.state, 'pending'), eq(bookingDocuments.state, 'accepted')),
        ),
      )
      .returning({ id: bookingDocuments.id });
    if (rows.length !== 1)
      throw new DomainError('CONFLICT', 409, 'Evidence already consumed or changed');
  }
  return sources;
}
