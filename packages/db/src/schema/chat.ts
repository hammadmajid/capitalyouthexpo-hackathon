import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { files } from './services.js';
export const conversations = pgTable(
  'conversations',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    lastMessageAt: instant('last_message_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('conversations_customer_branch_uq').on(table.branchId, table.customerUserId),
    index('conversations_customer_page_idx').on(table.customerUserId, table.id),
    index('conversations_branch_page_idx').on(table.branchId, table.id),
  ],
);
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: identifier(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id),
    senderSide: text('sender_side').$type<'customer' | 'branch'>().notNull(),
    body: text('body'),
    createdAt: instant('created_at').notNull().defaultNow(),
    deletedAt: instant('deleted_at'),
  },
  (table) => [
    check('chat_messages_sender_side_check', sql`${table.senderSide} in ('customer','branch')`),
    check(
      'chat_messages_body_check',
      sql`${table.body} is null or length(btrim(${table.body})) between 1 and 4000`,
    ),
    index('chat_messages_conversation_page_idx').on(table.conversationId, table.id),
    index('chat_messages_sender_idx').on(table.senderUserId),
  ],
);
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.fileId] }),
    unique('chat_attachments_file_uq').on(table.fileId),
  ],
);
export const conversationReads = pgTable(
  'conversation_reads',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    lastReadAt: instant('last_read_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_reads_user_idx').on(table.userId),
  ],
);
