import { and, eq } from 'drizzle-orm';
import { lockInventoryBranch, stays } from '@hsm/db';
import { DomainError, stayIdentifierSchema } from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
const rowSchema = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  userId: stayIdentifierSchema,
});
function bound(value: unknown, actor: Actor, stayId: string) {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== stayId || parsed.data.userId !== actor.userId)
    throw new DomainError('INTERNAL', 500, 'Own Stay notice scope unavailable');
  return parsed.data;
}
// OUT-001 / SEC-003: actual account linkage, not a Customer profile or guessed contact.
// Read only to find the branch; acquire hierarchy before the protected Stay lock.
export async function lockOwnNoticeAuthority(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  clock: () => Date,
) {
  await lockActor(tx, actor, clock);
  const [probe] = await tx
    .select({ id: stays.id, branchId: stays.branchId, userId: stays.userId })
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.userId, actor.userId)));
  if (!probe) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const current = bound(probe, actor, stayId),
    hierarchy = await lockInventoryBranch(tx, current.branchId);
  if (hierarchy.branch.id !== current.branchId)
    throw new DomainError('INTERNAL', 500, 'Own Stay branch binding unavailable');
  if (
    [hierarchy.organization, hierarchy.brand, hierarchy.branch].some(
      (row) => row.archivedAt !== null,
    )
  )
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  const [locked] = await tx
    .select({ id: stays.id, branchId: stays.branchId, userId: stays.userId })
    .from(stays)
    .where(
      and(
        eq(stays.id, stayId),
        eq(stays.branchId, current.branchId),
        eq(stays.userId, actor.userId),
      ),
    )
    .for('update');
  if (!locked) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const result = bound(locked, actor, stayId);
  if (result.branchId !== current.branchId)
    throw new DomainError('INTERNAL', 500, 'Own Stay notice binding unavailable');
  await lockActor(tx, actor, clock);
  return result;
}
