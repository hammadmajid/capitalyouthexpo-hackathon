import { sql } from 'drizzle-orm';
import { bigint, pgEnum, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

export const financeCheckKind = pgEnum('finance_check_kind_enum', [
  'charge',
  'adjustment',
  'invoice',
  'payment',
  'movement',
  'reversal',
  'funding',
]);
// Internal transaction-local deduplication, not financial history or a user-visible queue.
// Deferred triggers validate each affected subject once, then remove this ephemeral row.
// Direct deletion/update/truncation is rejected by the validation migration.
export const residentFinanceChecks = pgTable(
  'resident_finance_checks',
  {
    transactionId: bigint('transaction_id', { mode: 'bigint' })
      .notNull()
      .default(sql`txid_current()`),
    kind: financeCheckKind('kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.transactionId, table.kind, table.subjectId] })],
);
