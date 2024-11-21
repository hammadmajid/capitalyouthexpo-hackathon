import { and, eq, isNull } from 'drizzle-orm';
import { adminAccounts, adminRoleGrants, chatMessages } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import type { ChatRepository } from './repository.js';
export async function reportedMessage(
  tx: Transaction,
  chat: ChatRepository,
  actor: Actor,
  messageId: string,
  branchId?: string,
  conversationId?: string,
) {
  await lockActor(tx, actor, chat.clock);
  const condition = and(
    eq(chatMessages.id, messageId),
    conversationId ? eq(chatMessages.conversationId, conversationId) : undefined,
  );
  const [source] = await tx
    .select({ conversationId: chatMessages.conversationId })
    .from(chatMessages)
    .where(condition);
  if (!source) throw new DomainError('NOT_FOUND', 404, 'Message unavailable');
  await chat.authorize(tx, actor, branchId, source.conversationId);
  const [message] = await tx.select().from(chatMessages).where(condition).for('share');
  if (!message) throw new DomainError('NOT_FOUND', 404, 'Message unavailable');
  return message;
}
export async function authorizeSafety(tx: Transaction, actor: Actor, clock: () => Date) {
  await lockActor(tx, actor, clock);
  const [account] = await tx
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.userId, actor.userId))
    .for('update');
  if (!account || account.status !== 'active')
    throw new DomainError('FORBIDDEN', 403, 'Safety case authority required');
  const grants = await tx
    .select()
    .from(adminRoleGrants)
    .where(and(eq(adminRoleGrants.adminUserId, actor.userId), isNull(adminRoleGrants.revokedAt)))
    .orderBy(adminRoleGrants.id)
    .for('update');
  const role = grants.find(
    (row) => row.role === 'support' || row.role === 'content_moderator',
  )?.role;
  if (!account.isRoot && !role)
    throw new DomainError('FORBIDDEN', 403, 'Safety case authority required');
  return account.isRoot ? 'root' : (role ?? 'support');
}
