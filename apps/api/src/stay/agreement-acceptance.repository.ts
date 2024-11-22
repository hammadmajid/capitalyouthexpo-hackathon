import { fingerprint } from '../idempotency/policy.js';
import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { agreementAcceptances, stayAgreements, stays, branches } from '@hsm/db';
import {
  agreementAcceptanceSchema,
  DomainError,
  type AgreementAcceptanceInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
export function agreementDigest(terms: Record<string, unknown>) {
  return fingerprint('stay.agreement.terms.v1', {}, terms).toString('hex');
}
export async function authorizeAcceptance(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  agreementId: string,
  clock: () => Date,
) {
  await lockActor(tx, actor, clock);
  const [stay] = await tx
    .select({ branchId: stays.branchId, organizationId: branches.organizationId })
    .from(stays)
    .innerJoin(branches, eq(branches.id, stays.branchId))
    .where(and(eq(stays.id, stayId), eq(stays.userId, actor.userId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const [agreement] = await tx
    .select()
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.branchId, stay.branchId),
        eq(stayAgreements.stayId, stayId),
        eq(stayAgreements.id, agreementId),
      ),
    );
  if (!agreement) throw new DomainError('NOT_FOUND', 404, 'Agreement unavailable');
  await lockActor(tx, actor, clock);
  return { ...agreement, organizationId: stay.organizationId };
}
export async function acceptAgreement(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  agreementId: string,
  input: AgreementAcceptanceInput,
  clock: () => Date,
) {
  const agreement = await authorizeAcceptance(tx, actor, stayId, agreementId, clock);
  const digest = agreementDigest(agreement.termsSnapshot);
  if (agreement.version !== input.version || digest !== input.termsDigest)
    throw new DomainError(
      'PRECONDITION_FAILED',
      412,
      'Review the current agreement before acknowledging',
    );
  const [previous] = await tx
    .select()
    .from(agreementAcceptances)
    .where(
      and(
        eq(agreementAcceptances.agreementId, agreementId),
        eq(agreementAcceptances.acceptedByUserId, actor.userId),
      ),
    );
  if (previous) return project(previous);
  const [saved] = await tx
    .insert(agreementAcceptances)
    .values({
      id: v7(),
      branchId: agreement.branchId,
      stayId,
      agreementId,
      agreementVersion: agreement.version,
      acceptedByUserId: actor.userId,
      actorSessionId: actor.sessionId,
      acceptedAt: clock(),
      termsDigest: digest,
    })
    .returning();
  if (!saved) throw new DomainError('INTERNAL', 500, 'Acknowledgement unavailable');
  const result = project(saved);
  await new AuditWriter().hostel(tx, {
    actorUserId: actor.userId,
    actorRole: 'resident',
    organizationId: agreement.organizationId,
    branchId: agreement.branchId,
    action: 'stay.agreement.acknowledged',
    targetType: 'stay_agreement',
    targetId: agreementId,
    before: null,
    after: result,
    createdAt: clock(),
  });
  return result;
}
export function project(row: typeof agreementAcceptances.$inferSelect) {
  return agreementAcceptanceSchema.parse({
    id: row.id,
    branchId: row.branchId,
    stayId: row.stayId,
    agreementId: row.agreementId,
    agreementVersion: row.agreementVersion,
    acceptedByUserId: row.acceptedByUserId,
    acceptedAt: row.acceptedAt.toISOString(),
    termsDigest: row.termsDigest,
    method: 'authenticated_acknowledgement',
  });
}
