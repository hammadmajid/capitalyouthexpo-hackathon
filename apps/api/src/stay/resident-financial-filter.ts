import { and, asc, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm';
import { readResidentInvoiceBalances, residentInvoices, stays } from '@hsm/db';
import type { ResidentDirectoryQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { monthRange } from '../insights/metrics.js';
type Row = { id: string; displayName: string; userId: string | null };
// RES-004 / FIN-001: filter authoritative balances BEFORE the resident page limit.
export async function financialResidentRows(
  tx: Transaction,
  branchId: string,
  query: ResidentDirectoryQuery,
  today: string,
  read: (input: ResidentDirectoryQuery) => Promise<Row[]>,
) {
  const selected: Row[] = [];
  let cursor = query.cursor;
  for (;;) {
    const candidates = await read({ ...query, ...(cursor ? { cursor } : {}) });
    if (!candidates.length) return selected;
    const eligible = await eligibleResidents(
      tx,
      branchId,
      candidates.map((row) => row.id),
      query,
      today,
    );
    selected.push(...candidates.filter((row) => eligible.has(row.id)));
    if (selected.length > query.limit || candidates.length < 100)
      return selected.slice(0, query.limit + 1);
    cursor = candidates.at(-1)?.id;
  }
}
async function eligibleResidents(
  tx: Transaction,
  branchId: string,
  ids: string[],
  query: ResidentDirectoryQuery,
  today: string,
) {
  const result = new Set<string>();
  const bounds = monthRange(query.month ?? today.slice(0, 7));
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx
      .select({
        id: residentInvoices.id,
        stayId: residentInvoices.stayId,
        residentId: stays.residentId,
      })
      .from(residentInvoices)
      .innerJoin(stays, and(eq(stays.id, residentInvoices.stayId), eq(stays.branchId, branchId)))
      .where(
        and(
          eq(residentInvoices.branchId, branchId),
          inArray(stays.residentId, ids),
          query.billing === 'due'
            ? gte(residentInvoices.dueDate, bounds.start)
            : lt(residentInvoices.dueDate, today),
          query.billing === 'due' ? lte(residentInvoices.dueDate, bounds.end) : undefined,
          cursor ? gt(residentInvoices.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(residentInvoices.id))
      .limit(100);
    if (!rows.length) return result;
    const balances = await readResidentInvoiceBalances(tx, {
      branchId,
      today,
      invoices: rows.map((row) => ({ invoiceId: row.id, stayId: row.stayId })),
    });
    const matching = new Set(
      balances
        .filter((balance) =>
          query.billing === 'overdue' ? balance.state === 'overdue' : balance.outstandingPaisa > 0,
        )
        .map((balance) => balance.invoiceId),
    );
    for (const row of rows) if (matching.has(row.id)) result.add(row.residentId);
    if (rows.length < 100) return result;
    cursor = rows.at(-1)?.id;
  }
}
