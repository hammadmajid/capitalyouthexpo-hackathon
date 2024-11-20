import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { bytea, identifier, instant } from './primitives.js';
import { visibility, filePurpose, scanStatus, channel, deliveryStatus } from './enums.js';

export const files = pgTable(
  'files',
  {
    id: identifier(),
    uploadedBy: uuid('uploaded_by').references((): AnyPgColumn => users.id),
    visibility: visibility('visibility').notNull(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    // Digest is populated by server validation after upload, not trusted from the client.
    sha256: bytea('sha256'),
    purpose: filePurpose('purpose').notNull(),
    scanStatus: scanStatus('scan_status').notNull().default('pending'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('files_uploader_idx').on(table.uploadedBy),
    check('files_size_check', sql`${table.sizeBytes} > 0`),
    check(
      'files_clean_digest_check',
      sql`${table.scanStatus} <> 'clean' or octet_length(${table.sha256}) = 32 and ${table.sha256} is not null`,
    ),
  ],
);
export const notifications = pgTable(
  'notifications',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    branchId: uuid('branch_id').references((): AnyPgColumn => branches.id),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    deepLink: text('deep_link'),
    dedupeKey: text('dedupe_key').notNull().unique(),
    readAt: instant('read_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('notifications_inbox_idx').on(table.userId, table.readAt, table.createdAt.desc()),
    index('notifications_branch_idx').on(table.branchId),
  ],
);
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: identifier(),
    eventType: text('event_type').notNull(),
    channel: channel('channel').notNull(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id),
    recipientAddress: text('recipient_address'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: deliveryStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: instant('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    providerMessageId: text('provider_message_id'),
    createdAt: instant('created_at').notNull().defaultNow(),
    sentAt: instant('sent_at'),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: instant('lease_expires_at'),
  },
  (table) => [
    index('outbox_delivery_idx').on(table.status, table.nextAttemptAt),
    index('outbox_recipient_idx').on(table.recipientUserId),
    check('outbox_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'outbox_lease_pair_check',
      sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
);
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: uuid('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    endpoint: text('endpoint').notNull(),
    requestHash: bytea('request_hash').notNull(),
    responseStatus: smallint('response_status').notNull(),
    responseBody: jsonb('response_body').$type<unknown>().notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    index('idempotency_created_idx').on(table.createdAt),
  ],
);
