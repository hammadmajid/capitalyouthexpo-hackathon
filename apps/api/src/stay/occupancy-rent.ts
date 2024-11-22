import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import {
  readResidentInvoiceBalances,
  residentInvoices,
  residentPaymentProofs,
  stays,
} from '@hsm/db';
import { DomainError, type OccupancyPage, type OccupancyRentStatus } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockInventoryScope } from '../inventory/scope.js';
type Room = OccupancyPage['data'][number];
// RENT-004 / PAY-008: all due invoices, including previous months, use agreed grace
// and receipt-backed allocations. No client date or uploaded proof can mark rent clear.
export async function withOccupancyRent(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  rooms: Room[],
  today: string,
  on: string,
) {
  const unknown = rooms.map((room) => ({
    ...room,
    beds: room.beds.map((bed) => ({ ...bed, rentStatus: null })),
  }));
  if (on !== today) return unknown;
  const ids = [
    ...new Set(
      rooms.flatMap((room) =>
        room.beds.flatMap((bed) => (bed.occupant ? [bed.occupant.stayId] : [])),
      ),
    ),
  ].sort();
  if (!ids.length) return unknown;
  try {
    await lockInventoryScope(tx, actor, branchId, 'finance_view');
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === 'FORBIDDEN' || error.code === 'BRANCH_FORBIDDEN')
    )
      return unknown;
    throw error;
  }
  const locked = await tx
    .select({ id: stays.id })
    .from(stays)
    .where(and(eq(stays.branchId, branchId), inArray(stays.id, ids)))
    .orderBy(asc(stays.id))
    .for('share');
  if (locked.length !== ids.length)
    throw new DomainError('INTERNAL', 500, 'Occupancy financial scope unavailable');
  const status = await rentByStay(tx, branchId, ids, today);
  return rooms.map((room) => ({
    ...room,
    beds: room.beds.map((bed) => ({
      ...bed,
      rentStatus: bed.occupant ? (status.get(bed.occupant.stayId) ?? 'clear') : null,
    })),
  }));
}
// Q5: a proof waiting for review is staff action and outranks the invoice states.
const rank: Record<OccupancyRentStatus, number> = {
  clear: 0,
  paid: 1,
  due: 2,
  overdue: 3,
  proof_pending: 4,
};
// CHG-048: every issued (not voided) invoice of the occupant, in bounded batches, through the
// shared receipt-backed balance projection. The most urgent invoice decides the bed.
async function rentByStay(tx: Transaction, branchId: string, ids: string[], today: string) {
  const status = new Map<string, OccupancyRentStatus>();
  const raise = (stayId: string, next: OccupancyRentStatus) => {
    if (rank[next] > rank[status.get(stayId) ?? 'clear']) status.set(stayId, next);
  };
  let cursor: string | undefined;
  for (;;) {
    const invoices = await tx
      .select({ invoiceId: residentInvoices.id, stayId: residentInvoices.stayId })
      .from(residentInvoices)
      .where(
        and(
          eq(residentInvoices.branchId, branchId),
          inArray(residentInvoices.stayId, ids),
          eq(residentInvoices.state, 'issued'),
          cursor ? gt(residentInvoices.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(residentInvoices.id))
      .limit(100);
    if (!invoices.length) break;
    const balances = await readResidentInvoiceBalances(tx, { branchId, today, invoices });
    const byInvoice = new Map(invoices.map((invoice) => [invoice.invoiceId, invoice.stayId]));
    for (const balance of balances) {
      const stayId = byInvoice.get(balance.invoiceId);
      if (!stayId) continue;
      if (balance.state === 'overdue') raise(stayId, 'overdue');
      // Q5: like the Rent Board, an unpaid invoice before its due date is neutral (issued),
      // not Due; a part payment always shows.
      else if (balance.state === 'partially_paid') raise(stayId, 'due');
      else if (balance.state === 'issued' && balance.dueDate <= today) raise(stayId, 'due');
      else if (balance.state === 'paid') raise(stayId, 'paid');
    }
    cursor = invoices.at(-1)?.invoiceId;
    if (invoices.length < 100) break;
  }
  // PAY-004: submitted proofs only flag review; they never make rent paid (PAY-008).
  const waiting = await tx
    .selectDistinct({ stayId: residentPaymentProofs.stayId })
    .from(residentPaymentProofs)
    .where(
      and(
        eq(residentPaymentProofs.branchId, branchId),
        inArray(residentPaymentProofs.stayId, ids),
        eq(residentPaymentProofs.state, 'submitted'),
      ),
    );
  for (const row of waiting) raise(row.stayId, 'proof_pending');
  return status;
}
