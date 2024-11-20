import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { cities } from './geography.js';
import { reports } from './reports.js';
import { verificationStatus } from './enums.js';
import { identifier, instant } from './primitives.js';
// ADM-007: every verification decision with the deciding admin and reason; append-only.
export const branchVerificationEvents = pgTable(
  'branch_verification_events',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    fromStatus: verificationStatus('from_status').notNull(),
    toStatus: verificationStatus('to_status').notNull(),
    reason: text('reason'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('branch_verification_events_branch_idx').on(table.branchId, table.id),
    index('branch_verification_events_admin_idx').on(table.adminUserId),
    check(
      'branch_verification_events_reason_check',
      sql`${table.reason} is null or length(btrim(${table.reason})) between 1 and 1000`,
    ),
  ],
);
// ADM-008 / REV-006: policy actions keep the evidence link and reason; reversible by design.
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: identifier(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason').notNull(),
    reportId: uuid('report_id').references(() => reports.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('moderation_actions_target_idx').on(table.targetType, table.targetId),
    index('moderation_actions_admin_idx').on(table.adminUserId),
    index('moderation_actions_report_idx').on(table.reportId),
    check(
      'moderation_actions_action_check',
      sql`${table.action} in ('hide_review','remove_review','restore_review','dismiss_report')`,
    ),
    check('moderation_actions_reason_check', sql`length(btrim(${table.reason})) between 1 and 500`),
  ],
);
// ADM-009: platform Help & Support, separate from resident-hostel complaints.
export const supportPriority = pgEnum('support_priority_enum', ['normal', 'high', 'critical']);
export const supportStatus = pgEnum('support_status_enum', [
  'open',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
]);
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: identifier(),
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => users.id),
    subject: text('subject').notNull(),
    category: text('category').notNull(),
    priority: supportPriority('priority').notNull(),
    status: supportStatus('status').notNull(),
    assignedAdminUserId: uuid('assigned_admin_user_id').references(() => users.id),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('support_tickets_queue_idx').on(table.status, table.priority, table.id),
    index('support_tickets_opener_idx').on(table.openedByUserId, table.id),
    index('support_tickets_assignee_idx').on(table.assignedAdminUserId),
    check('support_tickets_subject_check', sql`length(btrim(${table.subject})) between 1 and 160`),
    check(
      'support_tickets_category_check',
      sql`${table.category} in ('account','listing','booking','payment','technical','other')`,
    ),
    check('support_tickets_version_check', sql`${table.version} > 0`),
  ],
);
export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: identifier(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    visibility: text('visibility').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('support_ticket_messages_ticket_idx').on(table.ticketId, table.id),
    index('support_ticket_messages_author_idx').on(table.authorUserId),
    check(
      'support_ticket_messages_body_check',
      sql`length(btrim(${table.body})) between 1 and 4000`,
    ),
    check(
      'support_ticket_messages_visibility_check',
      sql`${table.visibility} in ('public','internal')`,
    ),
  ],
);
// ADM-010: in-app announcements to an approved audience, delivered by the outbox worker.
export const announcementAudience = pgEnum('announcement_audience_enum', [
  'all_managers',
  'selected_branches',
  'customers',
  'city',
]);
export const announcementStatus = pgEnum('announcement_status_enum', [
  'scheduled',
  'sent',
  'cancelled',
]);
export const announcements = pgTable(
  'announcements',
  {
    id: identifier(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    audience: announcementAudience('audience').notNull(),
    branchIds: uuid('branch_ids').array().notNull(),
    cityId: uuid('city_id').references(() => cities.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: announcementStatus('status').notNull(),
    scheduledAt: instant('scheduled_at').notNull(),
    sentAt: instant('sent_at'),
    recipientCount: integer('recipient_count'),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('announcements_due_idx').on(table.status, table.scheduledAt),
    index('announcements_creator_idx').on(table.createdByUserId),
    index('announcements_city_idx').on(table.cityId),
    check('announcements_title_check', sql`length(btrim(${table.title})) between 1 and 120`),
    check('announcements_body_check', sql`length(btrim(${table.body})) between 1 and 2000`),
    check(
      'announcements_audience_check',
      sql`(${table.audience} = 'selected_branches') = (cardinality(${table.branchIds}) between 1 and 200) and (${table.audience} = 'city') = (${table.cityId} is not null)`,
    ),
    check(
      'announcements_sent_check',
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null and ${table.recipientCount} is not null)`,
    ),
  ],
);
