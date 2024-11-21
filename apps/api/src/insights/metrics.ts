import { and, between, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { bookings, complaints, residentInvoices, residentPaymentProofs, stays } from '@hsm/db';
import { money, moneyToJson } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { metricInvoiceBalances } from './metric-invoices.js';
import {
  unresolvedComplaints,
  upcomingCheckouts as upcomingCheckoutFilter,
} from './dashboard-queue-predicates.js';
export const OPEN_STAYS = ['active', 'notice_given', 'checkout_pending'] as const;
export function monthRange(month: string) {
  const last = new Date(month + '-01T00:00:00Z');
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { start: month + '-01', end: last.toISOString().slice(0, 10) };
}
// FIN-001 / RB: the month's invoices by due date, valued by the same balance function the
// Rent Board and settlement use (adjustments, allocations and grace included).
export async function rentMonth(
  tx: Transaction,
  branchId: string,
  month: string,
  today: string,
  filter?: SQL,
  state?: string,
) {
  const { start, end } = monthRange(month);
  let expected = 0n,
    collected = 0n,
    outstanding = 0n,
    invoices = 0,
    overdue = 0;
  for await (const balance of metricInvoiceBalances(
    tx,
    branchId,
    today,
    and(between(residentInvoices.dueDate, start, end), filter),
  )) {
    if (state !== undefined && balance.state !== state) continue;
    invoices += 1;
    if (balance.state === 'voided' || balance.state === 'no_charge') continue;
    expected +=
      BigInt(balance.totalPaisa) +
      BigInt(balance.debitAdjustmentsPaisa) -
      BigInt(balance.creditAdjustmentsPaisa);
    collected += BigInt(balance.allocatedPaisa);
    outstanding += BigInt(balance.outstandingPaisa);
    if (balance.state === 'overdue') overdue += 1;
  }
  return {
    month,
    invoices,
    expectedPaisa: moneyToJson(money(expected)),
    collectedPaisa: moneyToJson(money(collected)),
    outstandingPaisa: moneyToJson(money(outstanding)),
    overdueInvoices: overdue,
  };
}
async function overdueInvoices(tx: Transaction, branchId: string, today: string) {
  let overdue = 0;
  for await (const balance of metricInvoiceBalances(
    tx,
    branchId,
    today,
    lt(residentInvoices.dueDate, today),
  )) {
    if (balance.state === 'overdue') overdue += 1;
  }
  return overdue;
}
const counted = (rows: { count: number }[]) => rows[0]?.count ?? 0;
// OWN-003 / MGRD-001: actionable counts, each matching a real queue the user can open.
export async function actionCounts(tx: Transaction, branchId: string, today: string) {
  const n = sql<number>`count(*)::int`;
  const pendingBookings = counted(
    await tx
      .select({ count: n })
      .from(bookings)
      .where(and(eq(bookings.branchId, branchId), eq(bookings.state, 'pending_request'))),
  );
  const pendingProofs = counted(
    await tx
      .select({ count: n })
      .from(residentPaymentProofs)
      .where(
        and(
          eq(residentPaymentProofs.branchId, branchId),
          eq(residentPaymentProofs.state, 'submitted'),
        ),
      ),
  );
  const openComplaints = counted(
    await tx
      .select({ count: n })
      .from(complaints)
      .where(and(eq(complaints.branchId, branchId), unresolvedComplaints())),
  );
  const upcomingCheckouts = counted(
    await tx
      .select({ count: n })
      .from(stays)
      .where(and(eq(stays.branchId, branchId), upcomingCheckoutFilter(today))),
  );
  return {
    pendingBookings,
    pendingProofs,
    openComplaints,
    upcomingCheckouts,
    overdueInvoices: await overdueInvoices(tx, branchId, today),
  };
}
// OWN-002: confirmed bookings not yet turned into a stay (awaiting check-in).
export async function confirmedBookings(tx: Transaction, branchId: string) {
  return counted(
    await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.branchId, branchId),
          eq(bookings.state, 'confirmed'),
          sql`not exists (select 1 from ${stays} where ${stays.bookingId} = ${bookings.id})`,
        ),
      ),
  );
}
export async function activeResidents(tx: Transaction, branchId: string) {
  return counted(
    await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(stays)
      .where(and(eq(stays.branchId, branchId), inArray(stays.state, [...OPEN_STAYS]))),
  );
}
