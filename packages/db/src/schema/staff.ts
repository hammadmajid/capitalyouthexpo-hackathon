import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { files } from './services.js';
import { identifier, instant } from './primitives.js';
// CHG-039 / SRS v2.27: branch-local staff (never an HSM login), versioned monthly salary terms,
// one salary obligation per month, record-only payments and versioned agreements.
export const staffStatus = pgEnum('staff_status_enum', ['active', 'inactive', 'ended']);
export const staffJobTitle = pgEnum('staff_job_title_enum', [
  'receptionist',
  'security_guard',
  'cleaner',
  'cook',
  'maintenance',
  'supervisor',
  'other',
]);
export const staffPaymentMethod = pgEnum('staff_payment_method_enum', [
  'cash',
  'bank_transfer',
  'mobile_wallet',
  'other',
]);
export const staffPaymentKind = pgEnum('staff_payment_kind_enum', ['payment', 'reversal']);
export const staffMembers = pgTable(
  'staff_members',
  {
    id: identifier(),
    organizationId: uuid('organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    jobTitle: staffJobTitle('job_title').notNull(),
    customTitle: text('custom_title'),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    status: staffStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    unique('staff_members_branch_uq').on(table.id, table.branchId),
    check('staff_members_name_check', sql`length(btrim(${table.fullName})) between 2 and 120`),
    check(
      'staff_members_phone_check',
      sql`${table.phone} is null or ${table.phone} ~ '^\\+92[0-9]{10}$'`,
    ),
    check(
      'staff_members_title_check',
      sql`(${table.jobTitle} = 'other') = (${table.customTitle} is not null) and (${table.customTitle} is null or length(btrim(${table.customTitle})) between 2 and 60)`,
    ),
    check(
      'staff_members_dates_check',
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
    check('staff_members_version_check', sql`${table.version} > 0`),
    index('staff_members_branch_idx').on(table.branchId, table.status),
    index('staff_members_creator_idx').on(table.createdByUserId),
  ],
);
export const staffSalaryTerms = pgTable(
  'staff_salary_terms',
  {
    id: identifier(),
    staffId: uuid('staff_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    version: integer('version').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    dueDay: smallint('due_day').notNull(),
    // First day of the first month these terms apply to.
    effectiveFrom: date('effective_from').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.staffId, table.branchId],
      foreignColumns: [staffMembers.id, staffMembers.branchId],
    }),
    unique('staff_salary_terms_version_uq').on(table.staffId, table.version),
    unique('staff_salary_terms_month_uq').on(table.staffId, table.effectiveFrom),
    check('staff_salary_terms_amount_check', sql`${table.amountPaisa} > 0`),
    check('staff_salary_terms_due_day_check', sql`${table.dueDay} between 1 and 28`),
    check('staff_salary_terms_month_check', sql`extract(day from ${table.effectiveFrom}) = 1`),
    check('staff_salary_terms_version_check', sql`${table.version} > 0`),
    index('staff_salary_terms_creator_idx').on(table.createdByUserId),
  ],
);
export const staffSalaries = pgTable(
  'staff_salaries',
  {
    id: identifier(),
    staffId: uuid('staff_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    termsId: uuid('terms_id')
      .notNull()
      .references(() => staffSalaryTerms.id),
    month: date('month').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    dueOn: date('due_on').notNull(),
    // Set when a partial month was issued with an explicit authorized amount.
    explicitByUserId: uuid('explicit_by_user_id').references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.staffId, table.branchId],
      foreignColumns: [staffMembers.id, staffMembers.branchId],
    }),
    unique('staff_salaries_month_uq').on(table.staffId, table.month),
    unique('staff_salaries_branch_uq').on(table.id, table.branchId, table.staffId),
    check('staff_salaries_amount_check', sql`${table.amountPaisa} >= 0`),
    check('staff_salaries_month_check', sql`extract(day from ${table.month}) = 1`),
    index('staff_salaries_branch_month_idx').on(table.branchId, table.month),
    index('staff_salaries_due_idx').on(table.branchId, table.dueOn),
    index('staff_salaries_terms_idx').on(table.termsId),
    index('staff_salaries_explicit_idx').on(table.explicitByUserId),
  ],
);
export const staffSalaryPayments = pgTable(
  'staff_salary_payments',
  {
    id: identifier(),
    salaryId: uuid('salary_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    kind: staffPaymentKind('kind').notNull().default('payment'),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    paidOn: date('paid_on').notNull(),
    method: staffPaymentMethod('method').notNull(),
    reference: text('reference'),
    note: text('note'),
    reversesPaymentId: uuid('reverses_payment_id'),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id),
    recordedAt: instant('recorded_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.salaryId, table.branchId, table.staffId],
      foreignColumns: [staffSalaries.id, staffSalaries.branchId, staffSalaries.staffId],
    }),
    foreignKey({ columns: [table.reversesPaymentId], foreignColumns: [table.id] }),
    unique('staff_salary_payments_reversal_uq').on(table.reversesPaymentId),
    check('staff_salary_payments_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'staff_salary_payments_kind_check',
      sql`(${table.kind} = 'reversal') = (${table.reversesPaymentId} is not null)`,
    ),
    check(
      'staff_salary_payments_text_check',
      sql`(${table.reference} is null or length(${table.reference}) <= 80) and (${table.note} is null or length(${table.note}) <= 300)`,
    ),
    index('staff_salary_payments_salary_idx').on(table.salaryId),
    index('staff_salary_payments_branch_idx').on(table.branchId, table.recordedAt),
    index('staff_salary_payments_recorder_idx').on(table.recordedByUserId),
  ],
);
export const staffAgreements = pgTable(
  'staff_agreements',
  {
    id: identifier(),
    staffId: uuid('staff_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    effectiveOn: date('effective_on').notNull(),
    termsId: uuid('terms_id').references(() => staffSalaryTerms.id),
    fileId: uuid('file_id').references(() => files.id),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.staffId, table.branchId],
      foreignColumns: [staffMembers.id, staffMembers.branchId],
    }),
    unique('staff_agreements_version_uq').on(table.staffId, table.version),
    check('staff_agreements_title_check', sql`length(btrim(${table.title})) between 2 and 120`),
    check('staff_agreements_body_check', sql`length(btrim(${table.body})) between 1 and 5000`),
    check('staff_agreements_version_check', sql`${table.version} > 0`),
    index('staff_agreements_terms_idx').on(table.termsId),
    index('staff_agreements_file_idx').on(table.fileId),
    index('staff_agreements_creator_idx').on(table.createdByUserId),
  ],
);
