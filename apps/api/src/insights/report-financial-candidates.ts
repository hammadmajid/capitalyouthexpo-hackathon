import { and, asc, eq, gt, inArray, lte, or, type SQL } from 'drizzle-orm';
import { residentInvoices, residents, stays } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';

const residentJoin = and(
  eq(residents.id, stays.residentId),
  eq(residents.branchId, stays.branchId),
);
// RPT-001 / AUD-006: candidate pages are bounded; eligibility and the export
// sentinel are decided only after canonical balances have been calculated.
export async function* invoiceCandidates(
  tx: Transaction,
  ids: string[],
  asOf: string,
  filter?: SQL,
) {
  let cursor: { id: string; due: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({
        id: residentInvoices.id,
        branchId: residentInvoices.branchId,
        stayId: residentInvoices.stayId,
        number: residentInvoices.number,
        due: residentInvoices.dueDate,
        resident: residents.displayName,
      })
      .from(residentInvoices)
      .innerJoin(
        stays,
        and(eq(stays.id, residentInvoices.stayId), eq(stays.branchId, residentInvoices.branchId)),
      )
      .innerJoin(residents, residentJoin)
      .where(
        and(
          inArray(residentInvoices.branchId, ids),
          lte(residentInvoices.dueDate, asOf),
          filter,
          cursor
            ? or(
                gt(residentInvoices.dueDate, cursor.due),
                and(eq(residentInvoices.dueDate, cursor.due), gt(residentInvoices.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id))
      .limit(100);
    if (rows.length) yield rows;
    if (rows.length < 100) return;
    cursor = rows.at(-1);
  }
}
export async function* fundCandidates(tx: Transaction, ids: string[], filter?: SQL) {
  let cursor: { id: string; resident: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({
        id: stays.id,
        branchId: stays.branchId,
        resident: residents.displayName,
        state: stays.state,
      })
      .from(stays)
      .innerJoin(residents, residentJoin)
      .where(
        and(
          inArray(stays.branchId, ids),
          filter,
          cursor
            ? or(
                gt(residents.displayName, cursor.resident),
                and(eq(residents.displayName, cursor.resident), gt(stays.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(residents.displayName), asc(stays.id))
      .limit(100);
    if (rows.length) yield rows;
    if (rows.length < 100) return;
    cursor = rows.at(-1);
  }
}
