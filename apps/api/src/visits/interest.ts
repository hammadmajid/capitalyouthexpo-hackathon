import { and, desc, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { visitInterestResponses, visitRequests } from '@hsm/db';
import { DomainError, visitInterestStateSchema, type VisitInterestInput } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function readVisitInterest(tx: Transaction, visit: typeof visitRequests.$inferSelect) {
  if (visit.status !== 'completed')
    throw new DomainError('CONFLICT', 409, 'Visit must be completed first');
  const [response] = await tx
    .select()
    .from(visitInterestResponses)
    .where(
      and(
        eq(visitInterestResponses.visitId, visit.id),
        eq(visitInterestResponses.branchId, visit.branchId),
      ),
    )
    .orderBy(desc(visitInterestResponses.visitVersion))
    .limit(1);
  return visitInterestStateSchema.parse({
    visitId: visit.id,
    branchId: visit.branchId,
    expectedUpdatedAt: visit.updatedAt.toISOString(),
    promptedAt: visit.followUpSentAt?.toISOString() ?? null,
    stillInterested: response?.stillInterested ?? null,
    respondedAt: response?.createdAt.toISOString() ?? null,
  });
}
export async function recordVisitInterest(
  tx: Transaction,
  visit: typeof visitRequests.$inferSelect,
  input: VisitInterestInput,
  now: Date,
) {
  if (visit.status !== 'completed')
    throw new DomainError('CONFLICT', 409, 'Visit must be completed first');
  if (visit.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new DomainError('PRECONDITION_FAILED', 412, 'Visit changed; reload before responding');
  const updatedAt = new Date(Math.max(now.getTime(), visit.updatedAt.getTime() + 1));
  await tx
    .insert(visitInterestResponses)
    .values({
      id: v7(),
      branchId: visit.branchId,
      visitId: visit.id,
      stillInterested: input.stillInterested,
      visitVersion: updatedAt,
      createdAt: now,
    });
  const [updated] = await tx
    .update(visitRequests)
    .set({ updatedAt })
    .where(and(eq(visitRequests.id, visit.id), eq(visitRequests.branchId, visit.branchId)))
    .returning();
  if (!updated) throw new Error('Visit response unavailable');
  return readVisitInterest(tx, updated);
}
