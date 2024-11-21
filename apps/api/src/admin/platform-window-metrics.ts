import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { bookingHistory, bookings } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
// Booking cohort: submitted within [from,to); each response is its first human decision.
export async function platformWindowMetrics(tx: Transaction, from: Date, to: Date) {
  const cohort = and(gte(bookings.createdAt, from), lt(bookings.createdAt, to));
  const states = await tx
    .select({ state: bookings.state, count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(cohort)
    .groupBy(bookings.state);
  const decisions = tx
    .select({
      id: bookings.id,
      requestedAt: bookings.createdAt,
      decidedAt: sql<Date>`min(${bookingHistory.createdAt})`.as('decided_at'),
    })
    .from(bookings)
    .innerJoin(bookingHistory, eq(bookingHistory.bookingId, bookings.id))
    .where(
      and(
        cohort,
        eq(bookingHistory.previousState, 'pending_request'),
        inArray(bookingHistory.nextState, ['confirmed', 'rejected']),
      ),
    )
    .groupBy(bookings.id, bookings.createdAt)
    .as('first_decisions');
  const [response] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<
        number | null
      >`avg(extract(epoch from (${decisions.decidedAt} - ${decisions.requestedAt})) / 3600)::float8`,
      slow: sql<number>`count(*) filter (where ${decisions.decidedAt} - ${decisions.requestedAt} > interval '24 hours')::int`,
    })
    .from(decisions);
  return {
    bookingRequests: states.reduce((sum, row) => sum + row.count, 0),
    bookingStates: states,
    respondedRequests: response?.count ?? 0,
    averageResponseHours: response?.average ?? null,
    slowResponses: response?.slow ?? 0,
  };
}
