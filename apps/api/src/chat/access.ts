import { and, eq } from 'drizzle-orm';
import { conversations, customerProfiles, lockInventoryBranch } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
export async function authorizeChatCustomer(tx: Transaction, actor: Actor, clock: () => Date) {
  await lockActor(tx, actor, clock);
  const [profile] = await tx
    .select({ id: customerProfiles.userId })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, actor.userId));
  if (!profile) throw new DomainError('FORBIDDEN', 403, 'Customer context required');
}
export async function authorizeChatScope(
  tx: Transaction,
  actor: Actor,
  clock: () => Date,
  branchId?: string,
) {
  await lockActor(tx, actor, clock);
  const scope = branchId ? await lockInventoryScope(tx, actor, branchId) : undefined;
  if (!branchId) await authorizeChatCustomer(tx, actor, clock);
  await lockActor(tx, actor, clock);
  return scope;
}
export async function lockConversation(
  tx: Transaction,
  actor: Actor,
  conversationId: string,
  branchId?: string,
) {
  const condition = and(
    eq(conversations.id, conversationId),
    branchId
      ? eq(conversations.branchId, branchId)
      : eq(conversations.customerUserId, actor.userId),
  );
  const [target] = await tx
    .select({ branchId: conversations.branchId })
    .from(conversations)
    .where(condition);
  if (!target) throw new DomainError('NOT_FOUND', 404, 'Conversation unavailable');
  await lockInventoryBranch(tx, target.branchId);
  const [row] = await tx.select().from(conversations).where(condition).for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Conversation unavailable');
  return row;
}
