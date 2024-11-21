import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import {
  readResidentFundBalances,
  readResidentInvoiceBalances,
  residentPayments,
  residentInvoices,
  residentReceipts,
  residents,
  stayFinalStatements,
  stays,
} from '@hsm/db';
import { DomainError, staySettlementSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { monthRange, rentMonth } from './metrics.js';
import { ROW_LIMIT, branchNames, paisa, type Table, type Window } from './reports-operational.js';
import { reportDay, reportStart as start, reportEndExclusive } from './report-calendar.js';
import { invoiceCandidates, fundCandidates } from './report-financial-candidates.js';
import {
  paymentAssignmentBoundary,
  reportAssignmentPredicate,
  reportResidentPredicate,
  reportSnapshotPredicate,
  reportStatusPredicate,
} from './report-filter-predicates.js';
const residentJoin = and(
  eq(residents.id, stays.residentId),
  eq(residents.branchId, stays.branchId),
);
// RENT / FIN: expected, collected and outstanding per branch per month (max 24 months).
export async function rentCollectionReport(
  tx: Transaction,
  ids: string[],
  w: Window,
): Promise<Table> {
  const first = (w.from ?? w.today).slice(0, 7),
    last = (w.to ?? w.today).slice(0, 7),
    rows: string[][] = [];
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  if (index(last) - index(first) + 1 > 24)
    throw new DomainError(
      'VALIDATION_FAILED',
      400,
      'Rent reports support at most 24 months per request',
    );
  const names = await branchNames(tx, ids);
  for (let month = first; month <= last;) {
    for (const id of ids) {
      const r = await rentMonth(
        tx,
        id,
        month,
        w.today,
        reportSnapshotPredicate(
          residentInvoices.branchId,
          residentInvoices.stayId,
          w.filters ?? {},
          w.to ?? w.today,
        ),
        w.filters?.status,
      );
      rows.push([
        names.get(id) ?? '',
        month,
        String(r.invoices),
        paisa(r.expectedPaisa),
        paisa(r.collectedPaisa),
        paisa(r.outstandingPaisa),
        String(r.overdueInvoices),
      ]);
    }
    if (month === last) break;
    const next = monthRange(month).end;
    const [y, m] = next.split('-').map(Number) as [number, number];
    month =
      m === 12
        ? `${String(y + 1).padStart(4, '0')}-01`
        : `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`;
  }
  return {
    columns: [
      'Branch',
      'Month',
      'Invoices',
      'Expected (PKR)',
      'Collected (PKR)',
      'Outstanding (PKR)',
      'Overdue invoices',
    ],
    rows,
  };
}
export async function outstandingReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids),
    asOf = w.to ?? w.today;
  const rows: string[][] = [];
  pages: for await (const invoices of invoiceCandidates(
    tx,
    ids,
    asOf,
    reportSnapshotPredicate(
      residentInvoices.branchId,
      residentInvoices.stayId,
      w.filters ?? {},
      asOf,
    ),
  )) {
    const balances = new Map<
      string,
      Awaited<ReturnType<typeof readResidentInvoiceBalances>>[number]
    >();
    for (const branchId of [...new Set(invoices.map((row) => row.branchId))]) {
      const result = await readResidentInvoiceBalances(tx, {
        branchId,
        today: w.today,
        invoices: invoices
          .filter((row) => row.branchId === branchId)
          .map((row) => ({ invoiceId: row.id, stayId: row.stayId })),
      });
      for (const balance of result) balances.set(balance.invoiceId, balance);
    }
    for (const invoice of invoices) {
      const balance = balances.get(invoice.id);
      if (!balance) throw new DomainError('INTERNAL', 500, 'Invoice financial data unavailable');
      if (
        balance.outstandingPaisa > 0 &&
        (w.filters?.status === undefined || balance.state === w.filters.status)
      )
        rows.push([
          names.get(invoice.branchId) ?? '',
          invoice.resident,
          invoice.number,
          invoice.due,
          balance.state,
          paisa(balance.outstandingPaisa),
        ]);
      if (rows.length > ROW_LIMIT) break pages;
    }
  }
  return { columns: ['Branch', 'Resident', 'Invoice', 'Due', 'State', 'Outstanding (PKR)'], rows };
}
export async function paymentsReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: residentPayments.branchId,
      paidOn: residentPayments.paidOn,
      receipt: residentReceipts.number,
      resident: residents.displayName,
      amount: residentPayments.amountPaisa,
      reference: residentPayments.transactionReference,
    })
    .from(residentPayments)
    .innerJoin(residentReceipts, eq(residentReceipts.paymentId, residentPayments.id))
    .innerJoin(stays, eq(stays.id, residentPayments.stayId))
    .innerJoin(residents, residentJoin)
    .where(
      and(
        inArray(residentPayments.branchId, ids),
        reportResidentPredicate(
          residentPayments.branchId,
          residentPayments.stayId,
          w.filters?.residentId,
        ),
        reportAssignmentPredicate(
          residentPayments.branchId,
          residentPayments.stayId,
          w.filters ?? {},
          paymentAssignmentBoundary(residentPayments.paidOn),
        ),
        w.from ? gte(residentPayments.paidOn, w.from) : undefined,
        w.to ? lte(residentPayments.paidOn, w.to) : undefined,
      ),
    )
    .orderBy(asc(residentPayments.paidOn))
    .limit(ROW_LIMIT + 1);
  return {
    columns: ['Branch', 'Paid on', 'Receipt', 'Resident', 'Amount (PKR)', 'Reference'],
    rows: rows.map((row) => [
      names.get(row.branchId) ?? '',
      row.paidOn,
      row.receipt,
      row.resident,
      paisa(row.amount),
      row.reference ?? '',
    ]),
  };
}
export async function depositsReport(tx: Transaction, ids: string[], w?: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows: string[][] = [];
  const filter = w
    ? and(
        reportSnapshotPredicate(stays.branchId, stays.id, w.filters ?? {}, w.to ?? w.today),
        reportStatusPredicate(stays.state, w.filters?.status),
      )
    : undefined;
  pages: for await (const list of fundCandidates(tx, ids, filter)) {
    const balances = new Map<
      string,
      Awaited<ReturnType<typeof readResidentFundBalances>>[number]
    >();
    for (const branchId of [...new Set(list.map((row) => row.branchId))]) {
      const result = await readResidentFundBalances(tx, {
        branchId,
        stayIds: list.filter((row) => row.branchId === branchId).map((row) => row.id),
      });
      for (const balance of result) balances.set(balance.stayId, balance);
    }
    for (const stay of list) {
      const funds = balances.get(stay.id);
      if (!funds) throw new DomainError('INTERNAL', 500, 'Resident funds unavailable');
      if (funds.deposit.receivedPaisa > 0)
        rows.push([
          names.get(stay.branchId) ?? '',
          stay.resident,
          stay.state,
          paisa(funds.deposit.receivedPaisa),
          paisa(funds.deposit.appliedToRentPaisa),
          paisa(funds.deposit.deductedPaisa),
          paisa(funds.deposit.refundedPaisa),
          paisa(funds.deposit.heldPaisa),
        ]);
      if (rows.length > ROW_LIMIT) break pages;
    }
  }
  return {
    columns: [
      'Branch',
      'Resident',
      'Stay',
      'Received',
      'Applied to rent',
      'Deducted',
      'Refunded',
      'Held',
    ],
    rows,
  };
}
export async function checkoutsReport(tx: Transaction, ids: string[], w: Window): Promise<Table> {
  const names = await branchNames(tx, ids);
  const rows = await tx
    .select({
      branchId: stayFinalStatements.branchId,
      createdAt: stayFinalStatements.createdAt,
      snapshot: stayFinalStatements.snapshot,
      resident: residents.displayName,
    })
    .from(stayFinalStatements)
    .innerJoin(stays, eq(stays.id, stayFinalStatements.stayId))
    .innerJoin(residents, residentJoin)
    .where(
      and(
        inArray(stayFinalStatements.branchId, ids),
        reportResidentPredicate(
          stayFinalStatements.branchId,
          stayFinalStatements.stayId,
          w.filters?.residentId,
        ),
        reportAssignmentPredicate(
          stayFinalStatements.branchId,
          stayFinalStatements.stayId,
          w.filters ?? {},
          stayFinalStatements.createdAt.getSQL(),
        ),
        reportStatusPredicate(stays.state, w.filters?.status),
        w.from ? gte(stayFinalStatements.createdAt, start(w.from)) : undefined,
        w.to ? lt(stayFinalStatements.createdAt, reportEndExclusive(w.to)) : undefined,
      ),
    )
    .orderBy(asc(stayFinalStatements.createdAt))
    .limit(ROW_LIMIT + 1);
  return {
    columns: [
      'Branch',
      'Checked out',
      'Resident',
      'Outstanding',
      'Deposit held',
      'Resident owes',
      'Hostel owes back',
    ],
    rows: rows.map((row) => {
      const s = staySettlementSchema.parse(row.snapshot);
      return [
        names.get(row.branchId) ?? '',
        reportDay(row.createdAt),
        row.resident,
        paisa(s.outstandingPaisa),
        paisa(s.deposit.heldPaisa),
        paisa(s.netPayablePaisa),
        paisa(s.netRefundablePaisa),
      ];
    }),
  };
}
