import { and, asc, eq, gt, or, type SQL } from 'drizzle-orm';
import { readResidentInvoiceBalances, residentInvoices } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';

// FIN-001 / OWN-003: bound query memory, never the authoritative result. The DB
// batch reader shares the operational invoice projection and receipt/grace rules.
export async function* metricInvoiceBalancePages(
  tx: Transaction,
  branchId: string,
  today: string,
  filter: SQL | undefined,
) {
  let cursor: { id: string; dueDate: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({
        id: residentInvoices.id,
        stayId: residentInvoices.stayId,
        dueDate: residentInvoices.dueDate,
      })
      .from(residentInvoices)
      .where(
        and(
          eq(residentInvoices.branchId, branchId),
          filter,
          cursor
            ? or(
                gt(residentInvoices.dueDate, cursor.dueDate),
                and(
                  eq(residentInvoices.dueDate, cursor.dueDate),
                  gt(residentInvoices.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id))
      .limit(100);
    if (rows.length) {
      const balances = await readResidentInvoiceBalances(tx, {
        branchId,
        today,
        invoices: rows.map((row) => ({ invoiceId: row.id, stayId: row.stayId })),
      });
      yield balances;
    }
    if (rows.length < 100) return;
    cursor = rows.at(-1);
  }
}

export async function* metricInvoiceBalances(
  ...args: Parameters<typeof metricInvoiceBalancePages>
) {
  for await (const page of metricInvoiceBalancePages(...args)) yield* page;
}
