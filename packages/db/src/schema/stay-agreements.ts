import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { stays } from './stays.js';
import { billingPolicies } from './billing-policies.js';
import { identifier, instant } from './primitives.js';

// RENT-003: immutable agreement versions retain the complete disclosed booking snapshot.
export const stayAgreements = pgTable(
  'stay_agreements',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    version: integer('version').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => billingPolicies.id),
    rentAmountPaisa: bigint('rent_amount_paisa', { mode: 'bigint' }).notNull(),
    depositPaisa: bigint('deposit_paisa', { mode: 'bigint' }).notNull(),
    termsSnapshot: jsonb('terms_snapshot').$type<Record<string, unknown>>().notNull(),
    bookingSnapshot: jsonb('booking_snapshot').$type<Record<string, unknown>>(),
    includedTransportRouteIds: uuid('included_transport_route_ids').array(),
    transportBillingSnapshot: jsonb('transport_billing_snapshot'),
    reason: text('reason').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('stay_agreements_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('stay_agreements_version_uq').on(table.stayId, table.version),
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    check('stay_agreements_version_check', sql`${table.version} > 0`),
    check(
      'stay_agreements_money_check',
      sql`${table.rentAmountPaisa} >= 0 and ${table.depositPaisa} >= 0`,
    ),
    check(
      'stay_agreements_json_check',
      sql`jsonb_typeof(${table.termsSnapshot}) = 'object' and (${table.bookingSnapshot} is null or jsonb_typeof(${table.bookingSnapshot}) = 'object')`,
    ),
    check(
      'stay_agreements_transport_snapshot_check',
      sql`${table.includedTransportRouteIds} is null or (${table.version} = 1 and ${table.bookingSnapshot} is null and cardinality(${table.includedTransportRouteIds}) <= 50)`,
    ),
    check(
      'stay_agreements_transport_billing_check',
      sql`${table.transportBillingSnapshot} is null or jsonb_typeof(${table.transportBillingSnapshot}) = 'object'`,
    ),
    check('stay_agreements_reason_check', sql`length(btrim(${table.reason})) between 1 and 500`),
    index('stay_agreements_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
