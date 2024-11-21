import { and, eq, isNull } from 'drizzle-orm';
import {
  branches,
  brands,
  chatMessages,
  conversations,
  managerAssignments,
  organizations,
  users,
} from '@hsm/db';
import { InvalidNotificationJob } from './contracts.js';
import type { NotificationTransaction } from './producer.js';
export async function chatRecipients(tx: NotificationTransaction, messageId: string) {
  const [source] = await tx
    .select({
      branchId: conversations.branchId,
      customerId: conversations.customerUserId,
      senderId: chatMessages.senderUserId,
      senderSide: chatMessages.senderSide,
      deletedAt: chatMessages.deletedAt,
    })
    .from(chatMessages)
    .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
    .where(eq(chatMessages.id, messageId));
  if (!source) throw new InvalidNotificationJob();
  if (source.deletedAt) return [];
  const [owner] = await tx
    .select({ id: organizations.ownerUserId })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .where(
      and(
        eq(branches.id, source.branchId),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    );
  if (!owner) return [];
  let targets: string[];
  if (source.senderSide === 'branch') targets = [source.customerId];
  else {
    const managers = await tx
      .select({ id: managerAssignments.userId })
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.branchId, source.branchId),
          eq(managerAssignments.status, 'active'),
        ),
      );
    targets = [owner.id, ...managers.map((row) => row.id)];
  }
  const result: string[] = [];
  for (const userId of [...new Set(targets)].filter((value) => value !== source.senderId).sort()) {
    const [active] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.accountStatus, 'active')));
    if (active) result.push(userId);
  }
  return result;
}
