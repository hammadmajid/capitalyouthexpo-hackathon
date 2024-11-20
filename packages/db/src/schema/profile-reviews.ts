import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { bytea, identifier, instant } from './primitives.js';
// HMA-015: source-only additive definitions. Migration generation/application is NOT authorized.
// Identity payloads are dedicated columns; no arbitrary JSON workflow or audit-payload storage.
export const profileReviewRequests = pgTable(
  'profile_review_requests',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    version: integer('version').notNull().default(1),
    reason: text('reason').notNull(),
    baselineDigest: bytea('baseline_digest').notNull(),
    previousFullName: text('previous_full_name'),
    proposedFullName: text('proposed_full_name'),
    previousCnicHash: bytea('previous_cnic_hash'),
    previousCnicEncrypted: bytea('previous_cnic_encrypted'),
    previousCnicLast4: text('previous_cnic_last4'),
    proposedCnicHash: bytea('proposed_cnic_hash'),
    proposedCnicEncrypted: bytea('proposed_cnic_encrypted'),
    proposedCnicLast4: text('proposed_cnic_last4'),
    previousPhotoFileId: uuid('previous_photo_file_id').references(() => files.id),
    proposedPhotoFileId: uuid('proposed_photo_file_id').references(() => files.id),
    submittedAt: instant('submitted_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (table) => [
    check(
      'profile_review_kind_data_check',
      sql`(${table.kind} = 'identity' and ${table.previousPhotoFileId} is null and ${table.proposedPhotoFileId} is null) or (${table.kind} = 'profile_photo' and ${table.previousFullName} is null and ${table.previousCnicHash} is null and ${table.previousCnicEncrypted} is null and ${table.previousCnicLast4} is null)`,
    ),
    index('profile_review_queue_idx').on(table.kind, table.status, table.id),
    index('profile_review_user_idx').on(table.userId, table.id),
    uniqueIndex('profile_review_one_pending_uq')
      .on(table.userId, table.kind)
      .where(sql`${table.status} = 'pending'`),
    check('profile_review_kind_check', sql`${table.kind} in ('identity','profile_photo')`),
    check(
      'profile_review_state_check',
      sql`${table.status} in ('pending','approved','rejected','cancelled','withdrawn') and (${table.kind} <> 'identity' or ${table.status} <> 'withdrawn')`,
    ),
    check('profile_review_version_check', sql`${table.version} > 0`),
    check('profile_review_reason_check', sql`length(btrim(${table.reason})) between 8 and 500`),
    check('profile_review_digest_check', sql`octet_length(${table.baselineDigest}) = 32`),
    check(
      'profile_review_payload_check',
      sql`(${table.kind} = 'identity' and ${table.proposedPhotoFileId} is null and (${table.proposedFullName} is not null or ${table.proposedCnicHash} is not null)) or (${table.kind} = 'profile_photo' and ${table.proposedPhotoFileId} is not null and ${table.proposedFullName} is null and ${table.proposedCnicHash} is null)`,
    ),
    check(
      'profile_review_cnic_check',
      sql`(${table.proposedCnicHash} is null and ${table.proposedCnicEncrypted} is null and ${table.proposedCnicLast4} is null) or (${table.proposedCnicHash} is not null and octet_length(${table.proposedCnicHash}) = 32 and ${table.proposedCnicEncrypted} is not null and ${table.proposedCnicLast4} is not null and ${table.proposedCnicLast4} ~ '^[0-9]{4}$')`,
    ),
    check(
      'profile_review_name_check',
      sql`${table.proposedFullName} is null or length(btrim(${table.proposedFullName})) between 2 and 150`,
    ),
  ],
);
export const profileReviewEvidence = pgTable(
  'profile_review_evidence',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => profileReviewRequests.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.position] }),
    uniqueIndex('profile_review_evidence_file_uq').on(table.requestId, table.fileId),
    check('profile_review_evidence_position_check', sql`${table.position} between 0 and 2`),
  ],
);
// Append-only decision rows need UPDATE/DELETE-rejection triggers in the future approved migration.
export const profileReviewDecisions = pgTable(
  'profile_review_decisions',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => profileReviewRequests.id),
    version: integer('version').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.version] }),
    check('profile_review_decision_version_check', sql`${table.version} > 1`),
    check(
      'profile_review_decision_action_check',
      sql`${table.action} in ('approve','reject','withdraw','cancel')`,
    ),
    check(
      'profile_review_decision_reason_check',
      sql`length(btrim(${table.reason})) between 8 and 500`,
    ),
  ],
);
