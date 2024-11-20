import { sql } from 'drizzle-orm';
import { char, check, index, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { files } from './services.js';
import { users } from './identity.js';
import { bytea, citext, identifier, instant, timestamps } from './primitives.js';

// RES-001/003: a branch relationship, never an invented account or a contact-based merge.
export const residents = pgTable(
  'residents',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    userId: uuid('user_id').references(() => users.id),
    displayName: text('display_name').notNull(),
    phone: text('phone'),
    email: citext('email'),
    // CHG-054 / CHG-004: private CNIC, encrypted with a keyed hash; only the last 4 are shown.
    cnicHash: bytea('cnic_hash'),
    cnicEncrypted: bytea('cnic_encrypted'),
    cnicLast4: char('cnic_last4', { length: 4 }),
    cnicPhotoFileId: uuid('cnic_photo_file_id').references(() => files.id),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('residents_branch_id_uq').on(table.branchId, table.id),
    unique('residents_branch_id_user_uq').on(table.branchId, table.id, table.userId),
    uniqueIndex('residents_branch_user_uq')
      .on(table.branchId, table.userId)
      .where(sql`${table.userId} is not null`),
    index('residents_directory_idx').on(table.branchId, table.id),
    index('residents_user_idx').on(table.userId),
    check('residents_name_check', sql`length(btrim(${table.displayName})) between 1 and 120`),
    check(
      'residents_phone_check',
      sql`${table.phone} is null or ${table.phone} ~ '^[+][1-9][0-9]{7,14}$'`,
    ),
    check(
      'residents_cnic_check',
      sql`(${table.cnicHash} is null and ${table.cnicEncrypted} is null and ${table.cnicLast4} is null) or (octet_length(${table.cnicHash}) = 32 and ${table.cnicEncrypted} is not null and ${table.cnicLast4} ~ '^[0-9]{4}$')`,
    ),
    check(
      'residents_email_check',
      sql`${table.email} is null or length(${table.email}) between 3 and 254`,
    ),
  ],
);
