import { and, count, desc, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import {
  branches,
  chatAttachments,
  chatMessages,
  conversationReads,
  conversations,
  users,
} from '@hsm/db';
import {
  chatMessagePageSchema,
  chatMessageSchema,
  conversationPageSchema,
  conversationSchema,
  type ManagementPage,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function conversationProjection(
  tx: Transaction,
  actorId: string,
  row: typeof conversations.$inferSelect,
) {
  const [scope] = await tx
    .select({ branchName: branches.name, customerName: users.fullName })
    .from(branches)
    .innerJoin(users, eq(users.id, row.customerUserId))
    .where(eq(branches.id, row.branchId));
  const [read] = await tx
    .select({ at: conversationReads.lastReadAt })
    .from(conversationReads)
    .where(
      and(eq(conversationReads.conversationId, row.id), eq(conversationReads.userId, actorId)),
    );
  const [unread] = await tx
    .select({ value: count() })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, row.id),
        ne(chatMessages.senderUserId, actorId),
        isNull(chatMessages.deletedAt),
        read ? gt(chatMessages.createdAt, read.at) : undefined,
      ),
    );
  return conversationSchema.parse({
    ...row,
    branchName: scope?.branchName,
    customerName: scope?.customerName,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lastReadAt: read?.at.toISOString() ?? null,
    unreadCount: unread?.value ?? 0,
  });
}
export async function conversationPage(
  tx: Transaction,
  actorId: string,
  page: ManagementPage,
  branchId?: string,
) {
  const rows = await tx
    .select()
    .from(conversations)
    .where(
      and(
        branchId ? eq(conversations.branchId, branchId) : eq(conversations.customerUserId, actorId),
        page.cursor ? gt(conversations.id, page.cursor) : undefined,
      ),
    )
    .orderBy(conversations.id)
    .limit(page.limit + 1);
  const selected = rows.slice(0, page.limit);
  return conversationPageSchema.parse({
    data: await Promise.all(selected.map((row) => conversationProjection(tx, actorId, row))),
    nextCursor: rows.length > page.limit ? selected.at(-1)?.id : null,
  });
}
export async function messageProjection(tx: Transaction, row: typeof chatMessages.$inferSelect) {
  const [sender] = await tx
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, row.senderUserId));
  const attachments = await tx
    .select({ id: chatAttachments.fileId })
    .from(chatAttachments)
    .where(eq(chatAttachments.messageId, row.id))
    .orderBy(chatAttachments.fileId);
  return chatMessageSchema.parse({
    id: row.id,
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    senderName: sender?.name,
    senderSide: row.senderSide,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    attachmentFileIds: attachments.map((file) => file.id),
  });
}
export async function messagePage(tx: Transaction, conversationId: string, page: ManagementPage) {
  const rows = await tx
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        isNull(chatMessages.deletedAt),
        page.cursor ? lt(chatMessages.id, page.cursor) : undefined,
      ),
    )
    .orderBy(desc(chatMessages.id))
    .limit(page.limit + 1);
  const selected = rows.slice(0, page.limit);
  return chatMessagePageSchema.parse({
    data: await Promise.all(selected.map((row) => messageProjection(tx, row))),
    nextCursor: rows.length > page.limit ? selected.at(-1)?.id : null,
  });
}
