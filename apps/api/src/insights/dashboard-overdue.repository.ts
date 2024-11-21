import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { readResidentInvoiceBalances, residentInvoices, residents, stays } from '@hsm/db';
import { DomainError, type ManagementPage, type DashboardQueuePage } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Row = Extract<DashboardQueuePage, { queue: 'overdue' }>['data'][number];
// FIN-001 / AUD-009: canonical eligibility precedes the visible page sentinel.
export async function overdueQueue(
  tx: Transaction,
  branchId: string,
  today: string,
  page: ManagementPage,
) {
  const selected: Row[] = [];
  let cursor = page.cursor;
  for (;;) {
    const candidates = await tx
      .select({
        id: residentInvoices.id,
        stayId: residentInvoices.stayId,
        displayName: residents.displayName,
      })
      .from(residentInvoices)
      .innerJoin(
        stays,
        and(eq(stays.id, residentInvoices.stayId), eq(stays.branchId, residentInvoices.branchId)),
      )
      .innerJoin(
        residents,
        and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
      )
      .where(
        and(
          eq(residentInvoices.branchId, branchId),
          lt(residentInvoices.dueDate, today),
          cursor ? gt(residentInvoices.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(residentInvoices.id))
      .limit(100);
    if (!candidates.length) return { data: selected, nextCursor: null };
    const balances = await readResidentInvoiceBalances(tx, {
      branchId,
      today,
      invoices: candidates.map((row) => ({ invoiceId: row.id, stayId: row.stayId })),
    });
    const byId = new Map(balances.map((balance) => [balance.invoiceId, balance]));
    for (const row of candidates) {
      const balance = byId.get(row.id);
      if (!balance) throw new DomainError('INTERNAL', 500, 'Invoice queue unavailable');
      if (balance.state === 'overdue')
        selected.push({ stayId: row.stayId, displayName: row.displayName, balance });
      if (selected.length > page.limit)
        return {
          data: selected.slice(0, page.limit),
          nextCursor: selected[page.limit - 1]?.balance.invoiceId ?? null,
        };
    }
    if (candidates.length < 100) return { data: selected, nextCursor: null };
    cursor = candidates.at(-1)?.id;
  }
}
