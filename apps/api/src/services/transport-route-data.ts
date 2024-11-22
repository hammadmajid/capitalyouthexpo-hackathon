import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import {
  areas,
  branchTransportOffer,
  includedTransportRoutes,
  places,
  transportDestinations,
  transportRoutes,
  transportSubscriptions,
  transportTrips,
} from '@hsm/db';
import {
  DomainError,
  money,
  moneyToJson,
  transportRouteListSchema,
  transportRouteSchema,
  type TransportDestination,
  type TransportStop,
  type TransportTrip,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Reader = Pick<Transaction, 'select'>;
type RouteRow = typeof transportRoutes.$inferSelect;
type Destination = typeof transportDestinations.$inferSelect;
type Trip = typeof transportTrips.$inferSelect;
const roles = new Set(['both', 'pickup', 'dropoff']);
export function projectRoute(
  row: RouteRow,
  destinations: Destination[] = [],
  trips: Trip[] = [],
  residentInclusion?: 'included' | 'not_in_agreement' | null,
) {
  return transportRouteSchema.parse({
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    description: row.description,
    monthlyChargePaisa: moneyToJson(money(row.monthlyChargePaisa)),
    departureTimes: row.departureTimes,
    stops: row.stops,
    status: row.status,
    version: row.version,
    pricingMode: row.pricingMode,
    includedFrom: row.includedFrom,
    destinations: destinations.map((item) => ({
      kind: item.kind,
      name: item.name,
      placeId: item.placeId,
      areaId: item.areaId,
    })),
    stopPoints: row.stops.map((name, index) => {
      const role = row.stopRoles[index];
      return { name, role: role && roles.has(role) ? role : 'both' };
    }),
    trips: trips.map((trip) => ({
      days: trip.days,
      outboundDeparts: trip.outboundDeparts,
      outboundArrives: trip.outboundArrives,
      outboundArrivesNextDay: trip.outboundArrivesNextDay,
      returnDeparts: trip.returnDeparts,
      returnDepartsNextDay: trip.returnDepartsNextDay,
      returnArrives: trip.returnArrives,
      returnArrivesNextDay: trip.returnArrivesNextDay,
      effectiveFrom: trip.effectiveFrom,
      active: trip.active,
    })),
    ...(residentInclusion !== undefined ? { residentInclusion } : {}),
  });
}
// CHG-049 (was CHG-042): a route is shown publicly or offered to residents once it says where
// it goes. Times are optional: owners list where transport is available, not a timetable.
export function routeComplete(
  row: Pick<RouteRow, 'departureTimes' | 'stops'>,
  destinations: number,
) {
  return row.stops.length > 0 || destinations > 0;
}
async function children(tx: Reader, routeIds: string[]) {
  if (!routeIds.length) return { destinations: [], trips: [] };
  const [destinations, trips] = await Promise.all([
    tx
      .select()
      .from(transportDestinations)
      .where(inArray(transportDestinations.routeId, routeIds))
      .orderBy(asc(transportDestinations.position)),
    tx
      .select()
      .from(transportTrips)
      .where(inArray(transportTrips.routeId, routeIds))
      .orderBy(asc(transportTrips.position)),
  ]);
  return { destinations, trips };
}
export async function readRoute(tx: Reader, row: RouteRow) {
  const parts = await children(tx, [row.id]);
  return projectRoute(row, parts.destinations, parts.trips);
}
export async function listRoutes(
  tx: Reader,
  branchId: string,
  options: {
    activeOnly: boolean;
    completeOnly: boolean;
    agreementRoutes?: ReadonlySet<string>;
    lockOffer?: boolean;
  },
) {
  const rows = await tx
    .select()
    .from(transportRoutes)
    .where(
      and(
        eq(transportRoutes.branchId, branchId),
        options.activeOnly ? eq(transportRoutes.status, 'active') : undefined,
      ),
    )
    .orderBy(asc(transportRoutes.name), asc(transportRoutes.id))
    .limit(50);
  const parts = await children(
    tx,
    rows.map((row) => row.id),
  );
  const policy = await branchTransportOffer(tx, branchId, options.lockOffer);
  const data = rows
    .map((row) => ({
      row,
      destinations: parts.destinations.filter((item) => item.routeId === row.id),
      trips: parts.trips.filter((item) => item.routeId === row.id),
    }))
    .filter((item) => !options.completeOnly || routeComplete(item.row, item.destinations.length))
    .map(({ row, destinations, trips }) => {
      const included = options.agreementRoutes?.has(row.id) ?? policy?.mode === 'included';
      const separate = policy?.mode === 'separate';
      return projectRoute(
        {
          ...row,
          pricingMode:
            included || (options.agreementRoutes && policy?.mode === 'included')
              ? 'included'
              : 'separate',
          includedFrom: null,
          monthlyChargePaisa: !included && separate ? BigInt(policy.monthlyChargePaisa) : 0n,
        },
        destinations,
        trips,
        options.agreementRoutes === undefined
          ? undefined
          : included
            ? 'included'
            : policy?.mode === 'included'
              ? 'not_in_agreement'
              : null,
      );
    });
  const offer = options.agreementRoutes?.size
    ? { mode: 'included' as const }
    : data.length && (!options.agreementRoutes || policy?.mode === 'separate')
      ? policy
      : null;
  return transportRouteListSchema.parse({
    branchId,
    data,
    offer,
  });
}
// CHG-042: shared with billing so the resident screen and invoices never disagree.
export function agreementTransportRoutes(tx: Reader, branchId: string, stayId: string) {
  return includedTransportRoutes(tx, branchId, stayId);
}
// Catalog destinations keep the catalog's own name, so nothing is invented or renamed.
export async function checkedDestinations(tx: Reader, input: TransportDestination[]) {
  const result: TransportDestination[] = [];
  for (const item of input) {
    if (item.placeId) {
      const [place] = await tx
        .select({ name: places.name, type: places.type, active: places.isActive })
        .from(places)
        .where(eq(places.id, item.placeId));
      if (!place?.active) throw invalid('That place is not in the HSM list');
      const allowed: Record<string, string[]> = {
        university: ['university', 'school'],
        office: ['office', 'business_hub', 'government'],
        area: ['locality'],
      };
      const expected = allowed[item.kind];
      if (expected && !expected.includes(place.type))
        throw invalid('That place is not a ' + item.kind);
      result.push({ ...item, name: place.name });
    } else if (item.areaId) {
      const [area] = await tx
        .select({ name: areas.name, active: areas.isActive })
        .from(areas)
        .where(eq(areas.id, item.areaId));
      if (!area?.active) throw invalid('That area is not in the HSM list');
      if (item.kind !== 'area') throw invalid('Only an area destination can use an area');
      result.push({ ...item, name: area.name });
    } else result.push(item);
  }
  return result;
}
function invalid(message: string) {
  return new DomainError('VALIDATION_FAILED', 422, message);
}
export function derivedLists(
  input: { departureTimes: string[]; stops: string[] },
  stopPoints: TransportStop[],
  trips: TransportTrip[],
) {
  const departures = trips.length
    ? [...new Set(trips.filter((trip) => trip.active).map((trip) => trip.outboundDeparts))].sort()
    : input.departureTimes;
  if (departures.length > 12)
    throw invalid('A route can have at most 12 different departure times');
  return {
    departureTimes: departures,
    stops: stopPoints.length ? stopPoints.map((stop) => stop.name) : input.stops,
    stopRoles: stopPoints.length ? stopPoints.map((stop) => stop.role) : [],
  };
}
export async function replaceChildren(
  tx: Transaction,
  route: { id: string; branchId: string },
  destinations: TransportDestination[],
  trips: TransportTrip[],
) {
  await tx.delete(transportDestinations).where(eq(transportDestinations.routeId, route.id));
  await tx.delete(transportTrips).where(eq(transportTrips.routeId, route.id));
  if (destinations.length)
    await tx.insert(transportDestinations).values(
      destinations.map((item, position) => ({
        branchId: route.branchId,
        routeId: route.id,
        position,
        kind: item.kind,
        name: item.name,
        placeId: item.placeId,
        areaId: item.areaId,
      })),
    );
  if (trips.length)
    await tx.insert(transportTrips).values(
      trips.map((trip, position) => ({
        branchId: route.branchId,
        routeId: route.id,
        position,
        ...trip,
      })),
    );
}
export async function hasLiveRiders(tx: Reader, branchId: string, today: string) {
  const [row] = await tx
    .select({ id: transportSubscriptions.id })
    .from(transportSubscriptions)
    .where(
      and(
        eq(transportSubscriptions.branchId, branchId),
        or(
          inArray(transportSubscriptions.status, ['requested', 'active']),
          and(
            eq(transportSubscriptions.status, 'ended'),
            gt(transportSubscriptions.effectiveTo, today),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}
export async function routeHasRiders(tx: Reader, branchId: string, routeId: string) {
  const [row] = await tx
    .select({ id: transportSubscriptions.id })
    .from(transportSubscriptions)
    .where(
      and(
        eq(transportSubscriptions.branchId, branchId),
        eq(transportSubscriptions.routeId, routeId),
        inArray(transportSubscriptions.status, ['requested', 'active']),
      ),
    )
    .limit(1);
  return Boolean(row);
}
