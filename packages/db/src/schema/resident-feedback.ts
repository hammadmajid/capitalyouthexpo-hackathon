import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { rooms, seats } from './inventory.js';
import { stays } from './stays.js';
import { identifier, instant } from './primitives.js';
// CMP-001..006: complaints belong to the reporting resident's active Stay and branch.
export const complaintCategory = pgEnum('complaint_category_enum', [
  'electricity',
  'plumbing',
  'wifi',
  'cleaning',
  'furniture',
  'ac',
  'geyser',
  'mess',
  'security',
  'staff',
  'other',
]);
export const complaintStatus = pgEnum('complaint_status_enum', [
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'reopened',
  'closed',
]);
export const complaints = pgTable(
  'complaints',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roomId: uuid('room_id').references(() => rooms.id),
    seatId: uuid('seat_id').references(() => seats.id),
    category: complaintCategory('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: complaintStatus('status').notNull(),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    reopenCount: smallint('reopen_count').notNull().default(0),
    resolvedAt: instant('resolved_at'),
    closedAt: instant('closed_at'),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('complaints_scope_uq').on(table.branchId, table.id),
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database index name, not a credential.
    index('complaints_branch_queue_idx').on(table.branchId, table.status, table.id),
    index('complaints_stay_idx').on(table.stayId, table.id),
    index('complaints_user_idx').on(table.userId),
    index('complaints_room_idx').on(table.roomId),
    index('complaints_seat_idx').on(table.seatId),
    index('complaints_assignee_idx').on(table.assignedToUserId),
    check('complaints_title_check', sql`length(btrim(${table.title})) between 1 and 120`),
    check(
      'complaints_description_check',
      sql`length(btrim(${table.description})) between 1 and 2000`,
    ),
    check('complaints_version_check', sql`${table.version} > 0`),
    check('complaints_reopen_check', sql`${table.reopenCount} between 0 and 1000`),
    check(
      'complaints_closed_check',
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`,
    ),
  ],
);
export const complaintAttachments = pgTable(
  'complaint_attachments',
  {
    complaintId: uuid('complaint_id')
      .notNull()
      .references(() => complaints.id),
    fileId: uuid('file_id')
      .notNull()
      .unique('complaint_attachments_file_uq')
      .references(() => files.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.complaintId, table.fileId] })],
);
// p.33 reopen history: every transition, assignment and note with its actor; append-only.
export const complaintEvents = pgTable(
  'complaint_events',
  {
    id: identifier(),
    complaintId: uuid('complaint_id')
      .notNull()
      .references(() => complaints.id),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorRole: text('actor_role').notNull(),
    fromStatus: complaintStatus('from_status'),
    toStatus: complaintStatus('to_status').notNull(),
    note: text('note'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('complaint_events_complaint_idx').on(table.complaintId, table.id),
    index('complaint_events_actor_idx').on(table.actorUserId),
    index('complaint_events_assignee_idx').on(table.assignedToUserId),
    check('complaint_events_role_check', sql`${table.actorRole} in ('resident','owner','manager')`),
    check(
      'complaint_events_note_check',
      sql`${table.note} is null or length(btrim(${table.note})) between 1 and 2000`,
    ),
  ],
);
// REV-001..006: one main review per verified Stay; ratings 1..5 per category (v1 baseline).
export const reviewStatus = pgEnum('review_status_enum', ['published', 'hidden', 'removed']);
export const reviews = pgTable(
  'reviews',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull().unique('reviews_stay_uq'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body'),
    status: reviewStatus('status').notNull(),
    moderationReason: text('moderation_reason'),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    editedAt: instant('edited_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    index('reviews_branch_idx').on(table.branchId, table.status, table.id),
    index('reviews_user_idx').on(table.userId),
    check(
      'reviews_body_check',
      sql`${table.body} is null or length(btrim(${table.body})) between 1 and 2000`,
    ),
    check(
      'reviews_moderation_check',
      sql`(${table.status} = 'published') = (${table.moderationReason} is null)`,
    ),
    check('reviews_version_check', sql`${table.version} > 0`),
  ],
);
export const reviewCategory = pgEnum('review_category_enum', [
  'cleanliness',
  'security',
  'food',
  'staff',
  'wifi',
  'facilities',
  'location',
  'value',
  'overall',
]);
export const reviewRatings = pgTable(
  'review_ratings',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    category: reviewCategory('category').notNull(),
    rating: smallint('rating').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.category] }),
    check('review_ratings_range_check', sql`${table.rating} between 1 and 5`),
  ],
);
export const reviewRevisions = pgTable(
  'review_revisions',
  {
    id: identifier(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    previousBody: text('previous_body'),
    previousRatings: jsonb('previous_ratings').$type<Record<string, number>>().notNull(),
    editedAt: instant('edited_at').notNull().defaultNow(),
  },
  (table) => [index('review_revisions_review_idx').on(table.reviewId, table.id)],
);
export const reviewReplies = pgTable(
  'review_replies',
  {
    id: identifier(),
    reviewId: uuid('review_id')
      .notNull()
      .unique('review_replies_review_uq')
      .references(() => reviews.id),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    editedAt: instant('edited_at'),
  },
  (table) => [
    index('review_replies_author_idx').on(table.authorUserId),
    check('review_replies_body_check', sql`length(btrim(${table.body})) between 1 and 1000`),
  ],
);
