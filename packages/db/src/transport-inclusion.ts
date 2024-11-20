import { and, asc, desc, eq, exists, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { billingPolicySchema, bookingQuoteSnapshotSchema } from '@hsm/contracts';
import {
  billingPolicies,
  stayAgreements,
  transportDestinations,
  transportRoutes,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
type Reader = Pick<PostingTransaction, 'select'>;
export async function branchTransportBilling(tx: Reader, branchId: string, lock = false) {
  const query = tx
    .select({ policy: billingPolicies.policy })
    .from(billingPolicies)
    .where(
      and(
        eq(billingPolicies.branchId, branchId),
        isNull(billingPolicies.roomTypeId),
        eq(billingPolicies.isCurrent, true),
      ),
    )
    .limit(1);
  const [current] = await (lock ? query.for('share') : query);
  return current ? (billingPolicySchema.parse(current.policy).transportBilling ?? null) : null;
}

export async function branchTransportOffer(tx: Reader, branchId: string, lock = false) {
  return (await branchTransportBilling(tx, branchId, lock))?.offer ?? null;
}

export async function availableTransportRouteIds(tx: Reader, branchId: string) {
  const destination = tx
    .select({ id: transportDestinations.id })
    .from(transportDestinations)
    .where(eq(transportDestinations.routeId, transportRoutes.id));
  const routes = await tx
    .select({ id: transportRoutes.id })
    .from(transportRoutes)
    .where(
      and(
        eq(transportRoutes.branchId, branchId),
        eq(transportRoutes.status, 'active'),
        sql`cardinality(${transportRoutes.departureTimes}) > 0`,
        or(sql`cardinality(${transportRoutes.stops}) > 0`, exists(destination)),
      ),
    )
    .orderBy(asc(transportRoutes.name), asc(transportRoutes.id))
    .limit(50);
  return routes.map(({ id }) => id);
}
// CHG-042: the transport routes a Stay's agreed rent includes. A booked Stay keeps what its
// booking quote recorded, even after later agreement versions (a rent change creates a new
// version without a booking snapshot). A walk-in Stay with no booking is included only in
// routes whose inclusion date is on or before its first agreement date: earlier agreements
// are never silently entitled.
export async function includedTransportRoutes(
  tx: Reader,
  branchId: string,
  stayId: string,
): Promise<Set<string>> {
  const scope = and(eq(stayAgreements.branchId, branchId), eq(stayAgreements.stayId, stayId));
  const [booked] = await tx
    .select({ booking: stayAgreements.bookingSnapshot })
    .from(stayAgreements)
    .where(and(scope, isNotNull(stayAgreements.bookingSnapshot)))
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  if (booked) {
    const quote = bookingQuoteSnapshotSchema.safeParse(booked.booking);
    return new Set(quote.success ? (quote.data.includedTransport ?? []).map(({ id }) => id) : []);
  }
  const [first] = await tx
    .select({
      from: stayAgreements.effectiveFrom,
      routeIds: stayAgreements.includedTransportRouteIds,
    })
    .from(stayAgreements)
    .where(scope)
    .orderBy(asc(stayAgreements.version))
    .limit(1);
  if (!first) return new Set();
  if (first.routeIds) return new Set(first.routeIds);
  const routes = await tx
    .select({ id: transportRoutes.id })
    .from(transportRoutes)
    .where(
      and(
        eq(transportRoutes.branchId, branchId),
        eq(transportRoutes.status, 'active'),
        eq(transportRoutes.pricingMode, 'included'),
        lte(transportRoutes.includedFrom, first.from),
      ),
    );
  return new Set(routes.map((row) => row.id));
}
