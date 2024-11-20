import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import { residentInvoices, residentPayments, residentReceipts } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { readResidentInvoiceBalance } from './resident-invoice-balance.js';
import { readResidentFundBalance } from './resident-fund-balance.js';

type Scope = { branchId: string; stayId: string; today: string };
const PAGE_SIZE = 100;

// OUT-005 / FIN-002: callers authorize the exact Stay and hold its lock throughout
// traversal. Bound each query, not the complete financial result. Reuse the same
// receipt/adjustment/grace projection as individual invoices and the Rent Board.
export async function* stayInvoiceBalances(tx: PostingTransaction, scope: Scope) {
  let cursor: { id: string; dueDate: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({ id: residentInvoices.id, dueDate: residentInvoices.dueDate })
      .from(residentInvoices)
      .where(
        and(
          eq(residentInvoices.branchId, scope.branchId),
          eq(residentInvoices.stayId, scope.stayId),
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
      .limit(PAGE_SIZE);
    for (const row of rows)
      yield await readResidentInvoiceBalance(tx, { ...scope, invoiceId: row.id });
    if (rows.length < PAGE_SIZE) return;
    cursor = rows.at(-1);
  }
}

// OUT-004/005: inspect every payment, including older sources hidden behind newer
// fully spent receipts. Preserve the existing newest-first presentation order.
export async function* stayFundSources(tx: PostingTransaction, scope: Omit<Scope, 'today'>) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx
      .select({ paymentId: residentPayments.id, receiptNumber: residentReceipts.number })
      .from(residentPayments)
      .innerJoin(residentReceipts, eq(residentReceipts.paymentId, residentPayments.id))
      .where(
        and(
          eq(residentPayments.branchId, scope.branchId),
          eq(residentPayments.stayId, scope.stayId),
          cursor ? lt(residentPayments.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(residentPayments.id))
      .limit(PAGE_SIZE);
    for (const row of rows) {
      const held = await readResidentFundBalance(tx, { ...scope, paymentId: row.paymentId });
      if (held.deposit.heldPaisa > 0 || held.advance.availablePaisa > 0)
        yield {
          ...row,
          depositPaisa: held.deposit.heldPaisa,
          advanceCreditPaisa: held.advance.availablePaisa,
        };
    }
    if (rows.length < PAGE_SIZE) return;
    cursor = rows.at(-1)?.paymentId;
  }
}
