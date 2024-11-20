import { check, index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { branches } from './ownership.js';
import { users } from './identity.js';
import { branchVerificationEvents } from './platform-admin.js';
import { identifier, instant } from './primitives.js';
// TRUST-002: immutable evidence captured in the original submission transaction.
// No historical backfill: absence means the old submission had no durable snapshot.
export const verificationSubmissions = pgTable(
  'verification_submissions',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    submittedAt: instant('submitted_at').notNull(),
    dossier: jsonb('dossier').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index('verification_submissions_branch_idx').on(table.branchId, table.id)],
);
export const verificationSnapshotItems = pgTable(
  'verification_snapshot_items',
  {
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => verificationSubmissions.id),
    kind: text('kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.submissionId, table.kind, table.sourceId] }),
    check(
      'verification_snapshot_items_kind_check',
      sql`${table.kind} in ('pricing','photo','fingerprint')`,
    ),
  ],
);
export const verificationDecisionSubmissions = pgTable(
  'verification_decision_submissions',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => branchVerificationEvents.id),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => verificationSubmissions.id),
  },
  (table) => [index('verification_decision_submissions_snapshot_idx').on(table.submissionId)],
);
