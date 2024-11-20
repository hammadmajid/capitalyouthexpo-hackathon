import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { cities, areas } from './geography.js';
import { citext, geography, identifier, instant, timestamps } from './primitives.js';
import {
  hostelCategory,
  propertyTier,
  verificationStatus,
  planStatus,
  upfront,
  lateFeeType,
  managerStatus,
} from './enums.js';

export const organizations = pgTable(
  'organizations',
  {
    id: identifier(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [index('organizations_owner_idx').on(table.ownerUserId)],
);
export const brands = pgTable(
  'brands',
  {
    id: identifier(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    logoFileId: uuid('logo_file_id').references(() => files.id),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('brands_organization_id_uq').on(table.organizationId, table.id),
    index('brands_logo_idx').on(table.logoFileId),
  ],
);
export const branches = pgTable(
  'branches',
  {
    id: identifier(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    brandId: uuid('brand_id').notNull(),
    name: text('name').notNull(),
    slug: citext('slug').notNull().unique(),
    category: hostelCategory('category'),
    propertyTier: propertyTier('property_tier'),
    establishmentYear: smallint('establishment_year'),
    cityId: uuid('city_id').references(() => cities.id),
    areaId: uuid('area_id'),
    subAreaId: uuid('sub_area_id'),
    addressLine: text('address_line'),
    location: geography('location'),
    description: text('description'),
    nearbyLandmark: text('nearby_landmark'),
    publicPhone: text('public_phone'),
    publicEmail: citext('public_email'),
    showPublicContact: boolean('show_public_contact').notNull().default(false),
    messIncluded: boolean('mess_included').notNull().default(false),
    messNotes: text('mess_notes'),
    verificationStatus: verificationStatus('verification_status').notNull().default('draft'),
    firstApprovedAt: instant('first_approved_at'),
    listingHiddenAt: instant('listing_hidden_at'),
    isPrimary: boolean('is_primary').notNull().default(false),
    planStatus: planStatus('plan_status').notNull().default('free'),
    completenessScore: smallint('completeness_score'),
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
    ratingCount: integer('rating_count').notNull().default(0),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('branches_organization_id_uq').on(table.organizationId, table.id),
    uniqueIndex('branches_one_live_primary_brand_uq')
      .on(table.brandId)
      .where(sql`${table.isPrimary} and ${table.archivedAt} is null`),
    check('branches_name_check', sql`length(btrim(${table.name})) > 0`),
    check(
      'branches_establishment_year_check',
      sql`${table.establishmentYear} between 1800 and 9999`,
    ),
    check(
      'branches_area_parent_check',
      sql`
      (${table.areaId} is null or ${table.cityId} is not null)
      and (${table.subAreaId} is null or ${table.areaId} is not null)`,
    ),
    check(
      'branches_submission_fields_check',
      sql`
      ${table.verificationStatus} in ('draft', 'changes_requested', 'rejected') or (
        ${table.category} is not null and ${table.cityId} is not null
        and ${table.areaId} is not null and ${table.addressLine} is not null
        and length(btrim(${table.addressLine})) > 0 and ${table.location} is not null)`,
    ),
    foreignKey({
      columns: [table.organizationId, table.brandId],
      foreignColumns: [brands.organizationId, brands.id],
    }),
    foreignKey({ columns: [table.cityId, table.areaId], foreignColumns: [areas.cityId, areas.id] }),
    foreignKey({
      columns: [table.cityId, table.subAreaId],
      foreignColumns: [areas.cityId, areas.id],
    }),
    index('branches_brand_idx').on(table.brandId),
    index('branches_sub_area_idx').on(table.subAreaId),
    index('branches_city_area_idx').on(table.cityId, table.areaId),
    index('branches_verification_idx').on(table.verificationStatus),
    index('branches_location_idx').using('gist', table.location),
  ],
);
// Schema defaults are structural; Q3/Q9 billing policy remains unresolved and inactive.
export const branchSettings = pgTable(
  'branch_settings',
  {
    branchId: uuid('branch_id')
      .primaryKey()
      .references(() => branches.id),
    reservationExpiryHours: integer('reservation_expiry_hours').notNull().default(48),
    upfrontRequirement: upfront('upfront_requirement').notNull().default('none'),
    proofRetryAllowed: boolean('proof_retry_allowed').notNull().default(true),
    partialPaymentsEnabled: boolean('partial_payments_enabled').notNull().default(false),
    rentDueDay: smallint('rent_due_day').notNull().default(5),
    graceDays: smallint('grace_days').notNull().default(3),
    lateFeeType: lateFeeType('late_fee_type').notNull().default('disabled'),
    lateFeeValue: bigint('late_fee_value', { mode: 'bigint' }),
    noticePeriodDays: smallint('notice_period_days').notNull().default(30),
    bookingRequestResponseHours: integer('booking_request_response_hours').notNull().default(24),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedByUserId: uuid('updated_by_user_id')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('branch_settings_updater_idx').on(table.updatedByUserId),
    check('branch_settings_due_day_check', sql`${table.rentDueDay} between 1 and 28`),
    check(
      'branch_settings_nonnegative_check',
      sql`${table.graceDays} >= 0 and ${table.noticePeriodDays} >= 0 and (${table.lateFeeValue} is null or ${table.lateFeeValue} >= 0)`,
    ),
    check(
      'branch_settings_hours_check',
      sql`${table.reservationExpiryHours} > 0 and ${table.bookingRequestResponseHours} > 0`,
    ),
  ],
);
export const managerAssignments = pgTable(
  'manager_assignments',
  {
    id: identifier(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    status: managerStatus('status').notNull().default('pending_activation'),
    tempPasswordHash: text('temp_password_hash'),
    tempPasswordExpiresAt: instant('temp_password_expires_at'),
    tempPasswordAttempts: smallint('temp_password_attempts').notNull().default(0),
    appointedByUserId: uuid('appointed_by_user_id')
      .notNull()
      .references(() => users.id),
    activatedAt: instant('activated_at'),
    suspendedAt: instant('suspended_at'),
    deactivatedAt: instant('deactivated_at'),
    lockedAt: instant('locked_at'),
    statusReason: text('status_reason'),
    ...timestamps(),
  },
  (table) => [
    // BR-04: suspension retains the live assignment; only deactivation releases it.
    uniqueIndex('manager_assignments_one_live_branch_uq')
      .on(table.userId)
      .where(sql`${table.status} <> 'deactivated'`),
    index('manager_assignments_user_idx').on(table.userId),
    index('manager_assignments_branch_status_idx').on(table.branchId, table.status),
    index('manager_assignments_owner_idx').on(table.appointedByUserId),
    check('manager_assignments_attempts_check', sql`${table.tempPasswordAttempts} between 0 and 5`),
  ],
);
