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
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { residentBillingSchedules } from './resident-billing-schedules.js';
import { residentCharges } from './resident-charges.js';
import { residentInvoices } from './resident-invoices.js';
import { notificationOutbox } from './services.js';
import { identifier, instant } from './primitives.js';
export const residentBillingOutcome = pgEnum('resident_billing_outcome', [
  'posted',
  'existing',
  'no_charge',
  'no_period',
  'manual_required',
  'obsolete',
]);
// FIN-002 / AUD-004: private execution proof is never a human posting actor or public DTO.
export const residentBillingExecutions = pgTable(
  'resident_billing_executions',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    scheduleId: uuid('schedule_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => notificationOutbox.id),
    leaseToken: uuid('lease_token').notNull(),
    leaseExpiresAt: instant('lease_expires_at').notNull(),
    scheduleVersion: integer('schedule_version').notNull(),
    periodIndex: bigint('period_index', { mode: 'bigint' }).notNull(),
    outcome: residentBillingOutcome('outcome').notNull(),
    sourceKey: text('source_key'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    dueDate: date('due_date'),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }),
    chargeId: uuid('charge_id'),
    invoiceId: uuid('invoice_id'),
    executedAt: instant('executed_at').notNull(),
  },
  (table) => [
    ...scopeDefinitions(table),
    unique('resident_billing_executions_job_uq').on(table.jobId),
    unique('resident_billing_executions_revision_uq').on(table.scheduleId, table.scheduleVersion),
    uniqueIndex('resident_billing_executions_period_uq')
      .on(table.scheduleId, table.periodIndex)
      .where(sql`${table.outcome} in ('posted', 'existing', 'no_charge')`),
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId, table.scheduleId],
      foreignColumns: [
        residentBillingSchedules.branchId,
        residentBillingSchedules.stayId,
        residentBillingSchedules.agreementId,
        residentBillingSchedules.id,
      ],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId, table.chargeId],
      foreignColumns: [
        residentCharges.branchId,
        residentCharges.stayId,
        residentCharges.agreementId,
        residentCharges.id,
      ],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    check(
      'resident_billing_executions_revision_check',
      sql`${table.scheduleVersion} > 0 and ${table.periodIndex} between 0 and 9007199254740991`,
    ),
    check(
      'resident_billing_executions_amount_check',
      sql`${table.amountPaisa} is null or ${table.amountPaisa} between 0 and 9007199254740991`,
    ),
    check(
      'resident_billing_executions_source_check',
      sql`${table.sourceKey} is null or length(btrim(${table.sourceKey})) between 1 and 240`,
    ),
    check(
      'resident_billing_executions_dates_check',
      sql`((${table.periodStart} is null and ${table.periodEnd} is null) or (${table.periodStart} is not null and ${table.periodEnd} is not null and ${table.periodStart} >= date '0001-01-01' and ${table.periodEnd} <= date '9999-12-31' and ${table.periodStart} < ${table.periodEnd})) and (${table.dueDate} is null or ${table.dueDate} between date '0001-01-01' and date '9999-12-31')`,
    ),
    check(
      'resident_billing_executions_lease_check',
      sql`${table.executedAt} < ${table.leaseExpiresAt}`,
    ),
    outcomeCheck(table),
    index('resident_billing_executions_charge_idx').on(table.chargeId),
    index('resident_billing_executions_invoice_idx').on(table.invoiceId),
  ],
);

function outcomeCheck(table: {
  [
    Key in
      | 'outcome'
      | 'sourceKey'
      | 'dueDate'
      | 'amountPaisa'
      | 'chargeId'
      | 'invoiceId'
      | 'periodStart'
      | 'periodEnd'
  ]: AnyPgColumn;
}) {
  return check(
    'resident_billing_executions_outcome_check',
    sql`case
    when ${table.outcome} in ('posted', 'existing') then num_nonnulls(${table.sourceKey}, ${table.dueDate}, ${table.amountPaisa}, ${table.chargeId}, ${table.invoiceId}) = 5 and ${table.amountPaisa} > 0
    when ${table.outcome} = 'no_charge' then ${table.sourceKey} is not null and ${table.dueDate} is not null and ${table.amountPaisa} = 0 and ${table.chargeId} is null and ${table.invoiceId} is null
    when ${table.outcome} = 'manual_required' then ${table.sourceKey} is not null and ${table.dueDate} is not null and num_nonnulls(${table.amountPaisa}, ${table.chargeId}, ${table.invoiceId}) = 0
    else num_nonnulls(${table.sourceKey}, ${table.periodStart}, ${table.periodEnd}, ${table.dueDate}, ${table.amountPaisa}, ${table.chargeId}, ${table.invoiceId}) = 0 end is true`,
  );
}

function scopeDefinitions(table: {
  [Key in 'branchId' | 'stayId' | 'agreementId' | 'id' | 'scheduleId']: AnyPgColumn;
}) {
  return [
    unique('resident_billing_executions_scope_uq').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.id,
    ),
    index('resident_billing_executions_scope_idx').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.scheduleId,
    ),
  ];
}
