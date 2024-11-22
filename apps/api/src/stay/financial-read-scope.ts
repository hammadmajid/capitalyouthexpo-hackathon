import { and, eq } from 'drizzle-orm';
import { stays } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
// SEC-003: server-linked own Stay or live finance_view in the exact branch. No profile or identity inference.
export async function lockFinancialReadStay(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  clock: () => Date,
  branchId?: string,
  lockMode: 'share' | 'update' = 'share',
) {
  await lockActor(tx, actor, clock);
  if (branchId !== undefined) {
    await lockInventoryScope(tx, actor, branchId, 'finance_view');
    await lockActor(tx, actor, clock);
  }
  const [row] = await tx
    .select({ id: stays.id, branchId: stays.branchId, userId: stays.userId })
    .from(stays)
    .where(
      and(
        eq(stays.id, stayId),
        branchId === undefined ? eq(stays.userId, actor.userId) : eq(stays.branchId, branchId),
      ),
    )
    .for(lockMode);
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (
    row.id !== stayId ||
    (branchId === undefined ? row.userId !== actor.userId : row.branchId !== branchId)
  )
    throw new DomainError('INTERNAL', 500, 'Stay financial scope unavailable');
  return row;
}
