import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  inet,
  pgTable,
  smallint,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { accountStatus, client, gender, otpPurpose } from './enums.js';
import { bytea, citext, identifier, instant, timestamps } from './primitives.js';
import { areas, places } from './geography.js';
import { files } from './services.js';

export const users = pgTable(
  'users',
  {
    id: identifier(),
    fullName: text('full_name').notNull(),
    email: citext('email').unique(),
    emailVerifiedAt: instant('email_verified_at'),
    phoneE164: text('phone_e164').unique(),
    phoneVerifiedAt: instant('phone_verified_at'),
    passwordHash: text('password_hash'),
    gender: gender('gender'),
    dateOfBirth: date('date_of_birth'),
    cnicHash: bytea('cnic_hash').unique(),
    cnicEncrypted: bytea('cnic_encrypted'),
    cnicLast4: char('cnic_last4', { length: 4 }),
    permanentAddress: text('permanent_address'),
    profilePhotoFileId: uuid('profile_photo_file_id').references((): AnyPgColumn => files.id),
    accountStatus: accountStatus('account_status').notNull().default('active'),
    ...timestamps(),
    lastLoginAt: instant('last_login_at'),
  },
  (table) => [index('users_photo_idx').on(table.profilePhotoFileId)],
);
export const customerProfiles = pgTable(
  'customer_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    universityPlaceId: uuid('university_place_id').references(() => places.id),
    employerPlaceId: uuid('employer_place_id').references(() => places.id),
    institutionText: text('institution_text'),
    age: smallint('age'),
    desiredAreaId: uuid('desired_area_id').references(() => areas.id),
    profileCompletedAt: instant('profile_completed_at'),
  },
  (table) => [
    check('profiles_age_check', sql`${table.age} is null or ${table.age} between 18 and 120`),
    index('profiles_university_idx').on(table.universityPlaceId),
    index('profiles_employer_idx').on(table.employerPlaceId),
    index('profiles_area_idx').on(table.desiredAreaId),
  ],
);
export const emailOtps = pgTable(
  'email_otps',
  {
    id: identifier(),
    userId: uuid('user_id').references(() => users.id),
    email: citext('email').notNull(),
    purpose: otpPurpose('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    expiresAt: instant('expires_at').notNull(),
    consumedAt: instant('consumed_at'),
    requestIp: inet('request_ip'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('email_otps_lookup_idx').on(table.email, table.purpose, table.createdAt.desc()),
    index('email_otps_user_idx').on(table.userId),
    check('email_otps_attempts_check', sql`${table.attempts} between 0 and 5`),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    client: client('client').notNull(),
    deviceLabel: text('device_label'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: instant('created_at').notNull().defaultNow(),
    lastUsedAt: instant('last_used_at').notNull().defaultNow(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    revokedReason: text('revoked_reason'),
    replacedBySessionId: uuid('replaced_by_session_id').references((): AnyPgColumn => sessions.id),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_active_user_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
    index('sessions_replacement_idx').on(table.replacedBySessionId),
  ],
);
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    expoPushToken: text('expo_push_token').notNull().unique(),
    platform: text('platform').notNull(),
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('push_tokens_user_idx').on(table.userId),
    check('push_tokens_platform_check', sql`${table.platform} in ('android','ios')`),
  ],
);
