import { and, count, eq, sql } from 'drizzle-orm';
import {
  branchTransportOffer,
  transportDestinations,
  transportRoutes,
  transportSubscriptions,
  transportTrips,
} from '@hsm/db';
import { money, moneyToJson, transportOverviewSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { karachiToday } from './dates.js';
// CHG-042: Transport home counts, all read live from the branch's own rows.
export async function transportOverview(
  tx: Pick<Transaction, 'select'>,
  branchId: string,
  now: Date,
  includeFinance: boolean,
) {
  const offer = await branchTransportOffer(tx, branchId);
  const today = karachiToday(now);
  // ISO weekday 1 = Monday .. 7 = Sunday for the Karachi calendar date.
  const weekday = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const routes = await tx
    .select({ status: transportRoutes.status, total: count() })
    .from(transportRoutes)
    .where(eq(transportRoutes.branchId, branchId))
    .groupBy(transportRoutes.status);
  const active = routes.filter((row) => row.status === 'active');
  const sum = (rows: typeof routes) => rows.reduce((total, row) => total + row.total, 0);
  const [destinations] = await tx
    .select({ total: count() })
    .from(transportDestinations)
    .innerJoin(transportRoutes, eq(transportRoutes.id, transportDestinations.routeId))
    .where(and(eq(transportDestinations.branchId, branchId), eq(transportRoutes.status, 'active')));
  const riding = sql`(${transportSubscriptions.status} in ('active', 'ended')
    and ${transportSubscriptions.effectiveFrom} <= ${today}
    and (${transportSubscriptions.effectiveTo} is null or ${transportSubscriptions.effectiveTo} > ${today}))`;
  const requested = sql`${transportSubscriptions.status} = 'requested'`;
  const [subscriptions] = await tx
    .select({
      riders:
        sql<number>`count(distinct ${transportSubscriptions.stayId}) filter (where ${riding})`.mapWith(
          Number,
        ),
      requests: sql<number>`count(*) filter (where ${requested})`.mapWith(Number),
      ...(includeFinance
        ? {
            charges: sql<string>`coalesce(sum(${transportSubscriptions.monthlyChargePaisa}) filter (where ${riding}), 0)::text`,
          }
        : {}),
    })
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.branchId, branchId));
  const [trips] = await tx
    .select({ total: count() })
    .from(transportTrips)
    .innerJoin(transportRoutes, eq(transportRoutes.id, transportTrips.routeId))
    .where(
      and(
        eq(transportTrips.branchId, branchId),
        eq(transportRoutes.status, 'active'),
        eq(transportTrips.active, true),
        sql`${transportTrips.effectiveFrom} <= ${today}`,
        sql`${weekday}::smallint = any(${transportTrips.days})`,
      ),
    );
  return transportOverviewSchema.parse({
    branchId,
    activeRoutes: sum(active),
    inactiveRoutes: sum(routes.filter((row) => row.status === 'inactive')),
    destinations: destinations?.total ?? 0,
    includedRoutes: offer?.mode === 'included' ? sum(active) : 0,
    paidRoutes: offer?.mode === 'separate' ? sum(active) : 0,
    activeSubscribers: subscriptions?.riders ?? 0,
    pendingRequests: subscriptions?.requests ?? 0,
    monthlyChargesPaisa: includeFinance
      ? moneyToJson(money(BigInt(subscriptions?.charges ?? '0')))
      : null,
    tripsToday: trips?.total ?? 0,
  });
}
