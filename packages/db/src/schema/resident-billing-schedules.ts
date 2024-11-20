import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { hostelAuditLog } from './admin-audit.js';
import { stayAgreements } from './stay-agreements.js';
import { notificationOutbox } from './services.js';
import { identifier, instant, timestamps } from './primitives.js';

export const residentBillingItem = pgEnum('resident_billing_item', [
  'rent',
  'mess',
  'utilities',
  'admission',
  // SERV-002 / P9-M5: optional transport billed from approved subscription windows.
  'transport',
]);
export const residentBillingCadence = pgEnum('resident_billing_cadence', ['periodic', 'one_time']);
export const residentBillingScheduleState = pgEnum('resident_billing_schedule_state', [
  'active',
  'manual_required',
  'exhausted',
  'superseded',
  'stopped',
]);
// RENT-004 / AUD-004: the actual human authorizer is distinct from agreement creator and executor.
export const residentBillingSchedules = pgTable(
  'resident_billing_schedules',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    item: residentBillingItem('item').notNull(),
    cadence: residentBillingCadence('cadence').notNull(),
    state: residentBillingScheduleState('state').notNull(),
    authorizedByUserId: uuid('authorized_by_user_id').notNull(),
    authorizationAuditId: bigint('authorization_audit_id', { mode: 'bigint' }).notNull(),
    version: integer('version').notNull(),
    periodIndex: bigint('period_index', { mode: 'bigint' }).notNull(),
    nextRunAt: instant('next_run_at'),
    currentJobId: uuid('current_job_id').references(() => notificationOutbox.id),
    ...timestamps(),
  },
  (table) => [
    unique('resident_billing_schedules_scope_uq').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.id,
    ),
    unique('resident_billing_schedules_item_uq').on(table.agreementId, table.item, table.cadence),
    uniqueIndex('resident_billing_schedules_live_item_uq')
      .on(table.stayId, table.item, table.cadence)
      .where(sql`${table.state} in ('active', 'manual_required')`),
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId],
      foreignColumns: [stayAgreements.branchId, stayAgreements.stayId, stayAgreements.id],
    }),
    foreignKey({
      columns: [table.branchId, table.authorizationAuditId, table.authorizedByUserId, table.id],
      foreignColumns: [
        hostelAuditLog.branchId,
        hostelAuditLog.id,
        hostelAuditLog.actorUserId,
        hostelAuditLog.targetId,
      ],
    }),
    check('resident_billing_schedules_version_check', sql`${table.version} > 0`),
    check(
      'resident_billing_schedules_cursor_check',
      sql`${table.periodIndex} between 0 and 9007199254740991`,
    ),
    check(
      'resident_billing_schedules_rent_cadence_check',
      sql`${table.item} <> 'rent' or ${table.cadence} = 'periodic'`,
    ),
    check(
      'resident_billing_schedules_work_check',
      sql`(${table.state} = 'active' and ${table.nextRunAt} is not null and ${table.currentJobId} is not null) or (${table.state} <> 'active' and ${table.nextRunAt} is null and ${table.currentJobId} is null)`,
    ),
    index('resident_billing_schedules_job_idx').on(table.currentJobId),
    index('resident_billing_schedules_authorizer_idx').on(table.authorizedByUserId),
    index('resident_billing_schedules_audit_idx').on(table.authorizationAuditId),
  ],
);
