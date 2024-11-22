import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import {
  readResidentInvoiceBalance,
  residentInvoices,
  residentPaymentProofInvoices,
  residentPaymentProofs,
  residents,
  rooms,
  seats,
  stayAssignments,
  stays,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  databaseDateSchema,
  rentBoardPageSchema,
  rentBoardState,
  type RentBoardQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
function karachiToday(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
// RB-004: calendar month bounds in Asia/Karachi (UTC+05:00, no daylight saving).
export function rentBoardMonth(month: string) {
  const year = Number(month.slice(0, 4)),
    index = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const start = month + '-01',
    end = month + '-' + String(last).padStart(2, '0');
  return { start, end, startsAt: new Date(start + 'T00:00:00+05:00') };
}
async function pageStays(
  tx: Transaction,
  branchId: string,
  bounds: ReturnType<typeof rentBoardMonth>,
  query: RentBoardQuery,
) {
  return tx
    .select({
      stayId: stays.id,
      residentId: stays.residentId,
      displayName: residents.displayName,
      stayState: stays.state,
      roomLabel: rooms.label,
      bedLabel: seats.label,
    })
    .from(stays)
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.stayId, stays.id),
        eq(stayAssignments.branchId, stays.branchId),
        isNull(stayAssignments.endedAt),
      ),
    )
    .leftJoin(rooms, eq(rooms.id, stayAssignments.roomId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId))
    .where(
      and(
        eq(stays.branchId, branchId),
        ne(stays.state, 'cancelled_before_checkin'),
        lte(stays.moveInDate, bounds.end),
        or(isNull(stays.closedAt), gte(stays.closedAt, bounds.startsAt)),
        query.cursor === undefined ? undefined : gt(stays.id, query.cursor),
      ),
    )
    .orderBy(asc(stays.id))
    .limit(query.limit + 1);
}
export class RentBoardRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  // RB-001..004 / RENT-004: billing-month board from issued invoices and the authoritative
  // per-invoice balance (no client recomputation, no inferred payment), finance_view only.
  page(actor: Actor, branchId: string, query: RentBoardQuery) {
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branchId, 'finance_view');
      await lockActor(tx, actor, this.clock);
      const today = karachiToday(this.clock()),
        month = query.month ?? today.slice(0, 7),
        bounds = rentBoardMonth(month);
      const rows = await pageStays(tx, branchId, bounds, query);
      const page = rows.slice(0, query.limit);
      const invoices =
        page.length === 0
          ? []
          : await tx
              .select({ id: residentInvoices.id, stayId: residentInvoices.stayId })
              .from(residentInvoices)
              .where(
                and(
                  eq(residentInvoices.branchId, branchId),
                  inArray(
                    residentInvoices.stayId,
                    page.map((row) => row.stayId),
                  ),
                  gte(residentInvoices.dueDate, bounds.start),
                  lte(residentInvoices.dueDate, bounds.end),
                ),
              )
              .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id));
      const pending =
        invoices.length === 0
          ? []
          : [
              ...(await tx
                .select({ invoiceId: residentPaymentProofs.invoiceId })
                .from(residentPaymentProofs)
                .where(
                  and(
                    eq(residentPaymentProofs.branchId, branchId),
                    eq(residentPaymentProofs.state, 'submitted'),
                    inArray(
                      residentPaymentProofs.invoiceId,
                      invoices.map((invoice) => invoice.id),
                    ),
                  ),
                )),
              // CHG-050: a bill paid as the extra bill of a waiting proof is pending too.
              ...(await tx
                .select({ invoiceId: residentPaymentProofInvoices.invoiceId })
                .from(residentPaymentProofInvoices)
                .innerJoin(
                  residentPaymentProofs,
                  eq(residentPaymentProofs.id, residentPaymentProofInvoices.proofId),
                )
                .where(
                  and(
                    eq(residentPaymentProofInvoices.branchId, branchId),
                    eq(residentPaymentProofs.state, 'submitted'),
                    inArray(
                      residentPaymentProofInvoices.invoiceId,
                      invoices.map((invoice) => invoice.id),
                    ),
                  ),
                )),
            ];
      const data = [];
      for (const row of page) {
        const balances: Awaited<ReturnType<typeof readResidentInvoiceBalance>>[] = [];
        for (const invoice of invoices.filter((item) => item.stayId === row.stayId).slice(0, 31))
          balances.push(
            await readResidentInvoiceBalance(tx, {
              branchId,
              stayId: row.stayId,
              invoiceId: invoice.id,
              today,
            }),
          );
        const pendingProofs = pending.filter((proof) =>
          balances.some((balance) => balance.invoiceId === proof.invoiceId),
        ).length;
        data.push({
          ...row,
          state: rentBoardState(
            balances.map((balance) => balance.state),
            pendingProofs,
          ),
          pendingProofs,
          invoices: balances,
        });
      }
      const result = rentBoardPageSchema.safeParse({
        branchId,
        month,
        data,
        nextCursor: rows.length > query.limit ? (page.at(-1)?.stayId ?? null) : null,
      });
      if (!result.success) throw new DomainError('INTERNAL', 500, 'Rent Board unavailable');
      return result.data;
    });
  }
}
