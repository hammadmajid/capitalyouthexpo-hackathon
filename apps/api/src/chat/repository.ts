import { and, eq, max } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  conversations,
  chatMessages,
  conversationReads,
  notificationOutbox,
  type Database,
} from '@hsm/db';
import { conversationReadSchema, type ChatMessageInput, type ManagementPage } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockVisitListing } from '../visits/access.js';
import { authorizeChatScope, lockConversation } from './access.js';
import {
  conversationPage,
  conversationProjection,
  messagePage,
  messageProjection,
} from './projection.js';
import { attachChatFiles } from './attachments.js';
export class ChatRepository {
  constructor(
    readonly database: Database,
    readonly bucket: string,
    readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId?: string, conversationId?: string) {
    await authorizeChatScope(tx, actor, this.clock, branchId);
    if (conversationId) await lockConversation(tx, actor, conversationId, branchId);
    await lockActor(tx, actor, this.clock);
    return true;
  }
  list(actor: Actor, page: ManagementPage, branchId?: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      return conversationPage(tx, actor.userId, page, branchId);
    });
  }
  messages(actor: Actor, conversationId: string, page: ManagementPage, branchId?: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId, conversationId);
      return messagePage(tx, conversationId, page);
    });
  }
  async create(tx: Transaction, actor: Actor, branchId: string) {
    await lockVisitListing(tx, branchId);
    await lockActor(tx, actor, this.clock);
    const [existing] = await tx
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.branchId, branchId), eq(conversations.customerUserId, actor.userId)),
      );
    if (existing) return conversationProjection(tx, actor.userId, existing);
    const [row] = await tx
      .insert(conversations)
      .values({ id: v7(), branchId, customerUserId: actor.userId, createdAt: this.clock() })
      .returning();
    if (!row) throw new Error('Conversation insert unavailable');
    return conversationProjection(tx, actor.userId, row);
  }
  async send(
    tx: Transaction,
    actor: Actor,
    conversationId: string,
    input: ChatMessageInput,
    branchId?: string,
  ) {
    const conversation = await lockConversation(tx, actor, conversationId, branchId);
    await lockActor(tx, actor, this.clock);
    const [latestRead] = await tx
      .select({ at: max(conversationReads.lastReadAt) })
      .from(conversationReads)
      .where(eq(conversationReads.conversationId, conversationId));
    const now = new Date(
      Math.max(
        this.clock().getTime(),
        conversation.lastMessageAt ? conversation.lastMessageAt.getTime() + 1 : 0,
        latestRead?.at ? new Date(latestRead.at).getTime() + 1 : 0,
      ),
    );
    const [row] = await tx
      .insert(chatMessages)
      .values({
        id: v7(),
        conversationId,
        senderUserId: actor.userId,
        senderSide: branchId ? 'branch' : 'customer',
        body: input.body ?? null,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('Message insert unavailable');
    await attachChatFiles(tx, actor, row.id, input.attachmentFileIds ?? [], this.bucket);
    await tx
      .update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, conversationId));
    await tx.insert(notificationOutbox).values({
      eventType: 'chat.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload: { event: 'chat.message.created', messageId: row.id },
      dedupeKey: 'chat.message:' + row.id,
      createdAt: now,
      nextAttemptAt: now,
    });
    if (branchId) {
      const scope = await authorizeChatScope(tx, actor, this.clock, branchId);
      if (!scope) throw new Error('Branch scope absent');
      await new AuditWriter().hostel(tx, {
        actorUserId: actor.userId,
        actorRole: scope.actorRole,
        organizationId: scope.organizationId,
        branchId,
        action: 'chat.message.sent',
        targetType: 'chat_message',
        targetId: row.id,
        after: { conversationId },
        createdAt: now,
      });
    }
    return messageProjection(tx, row);
  }
  async markRead(tx: Transaction, actor: Actor, conversationId: string, branchId?: string) {
    const conversation = await lockConversation(tx, actor, conversationId, branchId);
    await lockActor(tx, actor, this.clock);
    const now = new Date(
      Math.max(this.clock().getTime(), conversation.lastMessageAt?.getTime() ?? 0),
    );
    await tx
      .insert(conversationReads)
      .values({ conversationId, userId: actor.userId, lastReadAt: now })
      .onConflictDoUpdate({
        target: [conversationReads.conversationId, conversationReads.userId],
        set: { lastReadAt: now },
      });
    return conversationReadSchema.parse({ conversationId, lastReadAt: now.toISOString() });
  }
}
