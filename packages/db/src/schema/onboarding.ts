import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { identifier, instant, timestamps } from './primitives.js';
// CHG-006: one identity; owner evidence extends the existing identity/property model.
export const ownerProfiles = pgTable(
  'owner_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    cnicFrontFileId: uuid('cnic_front_file_id').references(() => files.id),
    cnicBackFileId: uuid('cnic_back_file_id').references(() => files.id),
    address: text('address').notNull(),
    agreementVersion: text('agreement_version').notNull(),
    agreementAcceptedAt: instant('agreement_accepted_at').notNull(),
    profileCompletedAt: instant('profile_completed_at').notNull(),
    ...timestamps(),
  },
  (table) => [
    index('owner_profiles_front_idx').on(table.cnicFrontFileId),
    index('owner_profiles_back_idx').on(table.cnicBackFileId),
    check(
      'owner_profiles_distinct_sides_check',
      sql`${table.cnicFrontFileId} <> ${table.cnicBackFileId}`,
    ),
    check(
      'owner_profiles_address_check',
      sql`char_length(trim(${table.address})) between 5 and 500`,
    ),
    check('owner_profiles_agreement_check', sql`${table.agreementVersion} = 'owner-foundation-v1'`),
  ],
);
// An opaque password-setup token is never an access JWT or refresh-session credential.
export const registrationSetups = pgTable(
  'registration_setups',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: instant('created_at').notNull().defaultNow(),
    expiresAt: instant('expires_at').notNull(),
    consumedAt: instant('consumed_at'),
  },
  (table) => [
    index('registration_setups_user_idx').on(table.userId),
    check('registration_setups_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
    check('registration_setups_hash_check', sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
