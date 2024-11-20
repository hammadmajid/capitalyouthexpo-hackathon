import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { adminAccounts } from './admin-audit.js';
import { identifier, instant } from './primitives.js';
export const reports = pgTable(
  'reports',
  {
    id: identifier(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('open'),
    handledByUserId: uuid('handled_by_user_id').references(() => adminAccounts.userId),
    resolution: text('resolution'),
    createdAt: instant('created_at').notNull().defaultNow(),
    resolvedAt: instant('resolved_at'),
  },
  (table) => [
    index('reports_reporter_page_idx').on(table.reporterUserId, table.id),
    index('reports_queue_page_idx').on(table.status, table.targetType, table.id),
    index('reports_target_idx').on(table.targetType, table.targetId),
    index('reports_handler_idx').on(table.handledByUserId),
    check(
      'reports_target_type_check',
      sql`${table.targetType} in ('branch','review','chat_message','user')`,
    ),
    check(
      'reports_reason_check',
      sql`${table.reason} in ('fake_listing','wrong_price','unsafe','harassment','scam','inappropriate_chat','spam','other')`,
    ),
    check(
      'reports_status_check',
      sql`${table.status} in ('open','investigating','actioned','dismissed')`,
    ),
    check(
      'reports_details_check',
      sql`${table.details} is null or (length(btrim(${table.details})) between 1 and 4000)`,
    ),
    check(
      'reports_resolution_check',
      sql`(${table.status} in ('actioned','dismissed')) = (${table.resolvedAt} is not null) and (${table.resolvedAt} is null or (${table.handledByUserId} is not null and ${table.resolution} is not null and length(btrim(${table.resolution})) > 0))`,
    ),
  ],
);
