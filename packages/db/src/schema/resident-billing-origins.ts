import { foreignKey, index, pgTable, primaryKey, unique, uuid } from 'drizzle-orm/pg-core';
import { residentBillingExecutions } from './resident-billing-executions.js';
import { residentCharges } from './resident-charges.js';
import { residentInvoices } from './resident-invoices.js';
// AUD-004 / FIN-002: private immutable origin; current mandatory human actors remain unchanged.
export const residentBillingOrigins = pgTable(
  'resident_billing_origins',
  {
    executionId: uuid('execution_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    chargeId: uuid('charge_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
  },
  (table) => [
    unique('resident_billing_origins_charge_uq').on(table.chargeId),
    primaryKey({ columns: [table.executionId, table.chargeId] }),
    index('resident_billing_origins_invoice_idx').on(table.invoiceId),
    foreignKey({
      name: 'resident_billing_origins_execution_fk',
      columns: [table.branchId, table.stayId, table.agreementId, table.executionId],
      foreignColumns: [
        residentBillingExecutions.branchId,
        residentBillingExecutions.stayId,
        residentBillingExecutions.agreementId,
        residentBillingExecutions.id,
      ],
    }),
    foreignKey({
      name: 'resident_billing_origins_charge_fk',
      columns: [table.branchId, table.stayId, table.agreementId, table.chargeId],
      foreignColumns: [
        residentCharges.branchId,
        residentCharges.stayId,
        residentCharges.agreementId,
        residentCharges.id,
      ],
    }),
    foreignKey({
      name: 'resident_billing_origins_invoice_fk',
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    index('resident_billing_origins_scope_idx').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.executionId,
    ),
  ],
);
