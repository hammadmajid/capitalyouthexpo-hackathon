import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  billingPolicies,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
  places,
  residentBillingSchedules,
  transportSubscriptions,
} from '@hsm/db';
import {
  transportOverviewSchema,
  billingPolicyVersionSchema,
  stayInvoiceReferencePageSchema,
  transportSubscriptionPageSchema,
  transportRouteListSchema,
  transportRouteSchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import { lifecycleHarness, withTransportFees } from './phase-nine-fixture.js';
const h = lifecycleHarness({ preScannedInventory: true });
beforeAll(() => h.start());
afterAll(() => h.close());
const weekdays = [1, 2, 3, 4, 5];
const trips = [
  {
    days: weekdays,
    outboundDeparts: '07:30',
    outboundArrives: '08:00',
    returnDeparts: '16:00',
    returnArrives: '16:30',
    effectiveFrom: '2026-07-01',
  },
  // One-way on Saturday; arrival unknown is left empty, not invented.
  { days: [6], outboundDeparts: '09:00', effectiveFrom: '2026-07-01' },
  // Night shift: arrives after midnight, explicitly next day.
  {
    days: weekdays,
    outboundDeparts: '22:00',
    outboundArrives: '00:30',
    outboundArrivesNextDay: true,
    effectiveFrom: '2026-07-01',
  },
];
async function place(type: 'university' | 'hotel', name: string) {
  const id = randomUUID();
  await h.fixture().connection.db.insert(places).values({
    id,
    type,
    name,
    slug: id,
    cityId: h.fixture().cityId,
    location: 'SRID=4326;POINT(73.05 33.68)',
  });
  return id;
}
it('CHG-042: routes keep destinations, stop roles and weekly trips; invalid input is refused', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-10-25');
  const url = `/v1/branches/${item.branchId}/transport/routes`;
  const campus = await place('university', 'Catalog University');
  const hotel = await place('hotel', 'Catalog Hotel');
  const route = transportRouteSchema.parse(
    await h.ok(url, {
      name: 'University and Blue Area',
      destinations: [
        { kind: 'university', name: 'Typed name ignored', placeId: campus },
        { kind: 'other', name: 'Blue Area offices' },
      ],
      stopPoints: [
        { name: 'Hostel gate', role: 'pickup' },
        { name: 'Campus gate', role: 'dropoff' },
      ],
      trips,
    }),
  );
  expect(route).toMatchObject({
    pricingMode: 'separate',
    departureTimes: ['07:30', '09:00', '22:00'],
    stops: ['Hostel gate', 'Campus gate'],
    stopPoints: [
      { name: 'Hostel gate', role: 'pickup' },
      { name: 'Campus gate', role: 'dropoff' },
    ],
  });
  expect(route.destinations[0]).toMatchObject({ name: 'Catalog University', placeId: campus });
  expect(route.trips).toHaveLength(3);
  expect(route.trips[1]).toMatchObject({ returnDeparts: null, outboundArrives: null });
  const refused = async (body: Record<string, unknown>) =>
    (await h.send(url, { name: 'Bad', monthlyChargePaisa: 100, ...body })).statusCode;
  // Return before the outbound leaves, duplicate departures, wrong catalog type, no price.
  expect(
    await refused({
      trips: [
        {
          days: [1],
          outboundDeparts: '08:00',
          returnDeparts: '07:00',
          effectiveFrom: '2026-07-01',
        },
      ],
    }),
  ).toBeGreaterThanOrEqual(400);
  expect(await refused({ trips: [trips[0], trips[0]] })).toBeGreaterThanOrEqual(400);
  expect(await refused({ destinations: [{ kind: 'university', name: 'x', placeId: hotel }] })).toBe(
    422,
  );
  expect(await refused({ monthlyChargePaisa: 0 })).toBeGreaterThanOrEqual(400);
  // An unfinished route stays private; the public sees only usable active routes.
  const draft = await h.ok(url, {
    name: 'Draft route',
    monthlyChargePaisa: 100000,
    status: 'inactive',
  });
  expect(draft.status).toBe('inactive');
  const invalidPublish = await h.send(url, {
    name: 'Unready route',
    monthlyChargePaisa: 100000,
    status: 'active',
  });
  expect(invalidPublish.statusCode).toBe(422);
  // CHG-049: a destination alone is enough; times are optional.
  const placeOnly = await h.ok(url, {
    name: 'Comsats only',
    monthlyChargePaisa: 100000,
    status: 'active',
    destinations: [{ kind: 'other', name: 'Comsats Campus' }],
  });
  expect(placeOnly.status).toBe('active');
  const readPublic = async () =>
    transportRouteListSchema.parse(
      (await h.get(`/v1/public/branches/${item.branchId}/transport/routes`)).json(),
    );
  const publicList = await readPublic();
  expect(publicList.data.map((row) => row.name).sort()).toEqual([
    'Comsats only',
    'University and Blue Area',
  ]);
  expect(publicList.offer).toBeNull();
  const timed = publicList.data.find((row) => row.name === 'University and Blue Area');
  expect(timed?.monthlyChargePaisa).toBe(0);
  expect(timed?.trips[0]).toMatchObject({
    outboundDeparts: '07:30',
    returnDeparts: '16:00',
  });
  const overview = transportOverviewSchema.parse(
    (await h.get(`/v1/branches/${item.branchId}/transport/overview`)).json(),
  );
  expect(overview).toMatchObject({
    activeRoutes: 2,
    inactiveRoutes: 1,
    paidRoutes: 0,
    destinations: 3,
  });
  expect(
    (await h.get(`/v1/branches/${item.branchId}/transport/overview`, h.fixture().customerBToken))
      .statusCode,
  ).toBe(403);
  const [audit] = await h
    .fixture()
    .connection.db.select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, route.id),
        eq(hostelAuditLog.action, 'transport.route.created'),
      ),
    );
  expect(audit?.after).toMatchObject({ trips: expect.any(Array) });
  const rules = { dueDay: 10, refundable: true, proration: { kind: 'full_period' as const } };
  const monthlySubscription = { ...rules, monthlyChargePaisa: 310000 };
  await h.configureTransport(item.branchId, { monthlySubscription });
  expect((await readPublic()).offer).toBeNull();
  await h.configureTransport(item.branchId, {
    ...rules,
    offer: { mode: 'separate', monthlyChargePaisa: 310000 },
  });
  expect((await readPublic()).offer).toEqual({ mode: 'separate', monthlyChargePaisa: 310000 });
  const included = await h.configureTransport(item.branchId, { offer: { mode: 'included' } });
  expect(included.policy.transportBilling).toEqual({
    offer: { mode: 'included' },
    monthlySubscription,
  });
  expect((await readPublic()).offer).toEqual({ mode: 'included' });
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
it('CHG-044: one prorated Transport subscription is collectible before its due date', async () => {
  const { item, stay, base } = await h.admitted(
    {
      ...withTransportFees,
      transportBilling: {
        offer: { mode: 'separate', monthlyChargePaisa: 310000 },
        dueDay: 15,
        refundable: false,
        proration: { kind: 'calendar_days', rounding: 'half_up' },
      },
    },
    '2026-10-25',
  );
  const url = `/v1/branches/${item.branchId}/transport/routes`;
  const common = { stops: ['Hostel'], departureTimes: ['08:00'] };
  const first = transportRouteSchema.parse(
    await h.ok(url, { ...common, name: 'Paid A', monthlyChargePaisa: 310000 }),
  );
  const second = transportRouteSchema.parse(
    await h.ok(url, { ...common, name: 'Paid B', monthlyChargePaisa: 310000 }),
  );
  const token = h.fixture().customerAToken;
  const mine = transportRouteListSchema.parse(
    (await h.get(`/v1/me/stays/${stay.stayId}/transport/routes`, token)).json(),
  );
  const own = `/v1/me/stays/${stay.stayId}/transport/subscriptions`;
  expect(mine.offer).toEqual({ mode: 'separate', monthlyChargePaisa: 310000 });
  const requests = await Promise.all([
    h.send(own, { routeId: first.id, monthlyChargePaisa: 310000 }, token),
    h.send(own, { routeId: second.id, monthlyChargePaisa: 310000 }, token),
  ]);
  expect(requests.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const a = transportSubscriptionSchema.parse(
    requests.find(({ statusCode }) => statusCode === 201)?.json(),
  );
  // Archiving a route leaves the subscription and its agreed fee intact.
  const [archive, remaining] = a.routeId === first.id ? [first, second] : [second, first];
  const switched = await h.fixture().application.inject({
    method: 'PUT',
    url: `${url}/${archive.id}`,
    headers: {
      authorization: 'Bearer ' + h.fixture().ownerToken,
      'Idempotency-Key': randomUUID(),
    },
    payload: {
      ...common,
      name: archive.name,
      expectedVersion: archive.version,
      status: 'inactive',
    },
  });
  expect(switched.statusCode).toBe(200);
  // An archived route moves the rider to the remaining active route.
  const [movedRider] = await h
    .fixture()
    .connection.db.select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.id, a.id));
  expect(movedRider?.routeId).toBe(remaining.id);
  await h.ok(`/v1/branches/${item.branchId}/transport/subscriptions/${a.id}/decision`, {
    decision: 'approve',
    expectedVersion: movedRider?.version ?? 1,
    effectiveFrom: '2026-07-10',
  });
  const { connection, ownerId, ownerToken } = h.fixture();
  await expect(
    connection.db.insert(transportSubscriptions).values({
      branchId: item.branchId,
      stayId: stay.stayId,
      routeId: second.id,
      status: 'ended',
      monthlyChargePaisa: 310000n,
      effectiveFrom: '2026-07-12',
      effectiveTo: '2026-07-20',
      version: 1,
      decidedByUserId: ownerId,
    }),
  ).rejects.toMatchObject({ cause: { code: '23P01' } });
  const [schedule] = await h
    .fixture()
    .connection.db.select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.stayId, stay.stayId),
        eq(residentBillingSchedules.item, 'transport'),
      ),
    );
  expect(schedule?.nextRunAt?.toISOString()).toBe('2026-07-09T19:00:00.000Z');
  await h.moveTo('2026-07-10T10:00:00Z');
  await h.deliver(schedule?.currentJobId ?? null);
  // July 22/31 days of one branch fee, posted once.
  const july = await h.charges(stay.stayId, 'transport');
  expect(july.map((row) => [row.periodStart, Number(row.amountPaisa)])).toEqual([
    ['2026-07-01', 220000],
  ]);
  const queue = transportSubscriptionPageSchema.parse(
    (await h.get(`/v1/branches/${item.branchId}/transport/subscriptions`)).json(),
  );
  const rider = queue.data.find((row) => row.id === a.id);
  expect(rider?.residentName).toBeTruthy();
  expect(rider?.billing).toMatchObject({
    dueDate: '2026-07-15',
    state: 'due',
    outstandingPaisa: 220000,
  });
  const genericInvoices = stayInvoiceReferencePageSchema.parse(
    (await h.get(base + '/invoices')).json(),
  );
  const transportInvoices = stayInvoiceReferencePageSchema.parse(
    (await h.get(base + '/invoices?category=transport')).json(),
  );
  expect(genericInvoices.data.some((row) => row.invoiceId === rider?.billing?.invoiceId)).toBe(
    false,
  );
  expect(transportInvoices.data.some((row) => row.invoiceId === rider?.billing?.invoiceId)).toBe(
    true,
  );
  const policyUrl = `/v1/branches/${item.branchId}/billing-policy`;
  const before = (await h.get(policyUrl)).json().effectiveVersion;
  const response = await h.fixture().application.inject({
    method: 'PUT',
    url: policyUrl + '/transport',
    headers: { authorization: 'Bearer ' + ownerToken, 'Idempotency-Key': randomUUID() },
    payload: {
      policyVersionId: before.id,
      transportBilling: { dueDay: 12, refundable: true, proration: { kind: 'full_period' } },
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  const saved = billingPolicyVersionSchema.parse(response.json());
  expect(saved.policy).toMatchObject({
    ...before.policy,
    transportBilling: { dueDay: 12, refundable: true },
  });
  const unchanged = transportSubscriptionPageSchema.parse(
    (await h.get(`/v1/branches/${item.branchId}/transport/subscriptions`)).json(),
  );
  expect(unchanged.data.find((row) => row.id === a.id)?.billing).toEqual(rider?.billing);
  async function billing() {
    const page = transportSubscriptionPageSchema.parse(
      (await h.get(`/v1/branches/${item.branchId}/transport/subscriptions`)).json(),
    );
    return page.data.find((row) => row.id === a.id)?.billing;
  }
  await h.moveTo('2026-07-15T10:00:00Z');
  expect((await billing())?.state).toBe('due');
  await h.moveTo('2026-07-16T10:00:00Z');
  expect((await billing())?.state).toBe('overdue');
  await h.ok(base + '/payments', {
    amountPaisa: 220000,
    method: 'cash',
    paidOn: h.date(),
    note: 'Transport paid directly',
    allocations: [{ invoiceId: rider?.billing?.invoiceId, amountPaisa: 220000 }],
    depositPaisa: 0,
    advanceCreditPaisa: 0,
  });
  expect(await billing()).toMatchObject({ state: 'paid', outstandingPaisa: 0 });
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});

it('CHG-042: booking captures eligible included transport without a subscription or fee', async () => {
  const admission = await h.admitted(
    { ...withTransportFees, transportBilling: { offer: { mode: 'included' } } },
    '2026-10-25',
    async (branch) => {
      await h.ok(`/v1/branches/${branch}/transport/routes`, {
        name: 'Campus shuttle',
        stops: ['Campus'],
        departureTimes: ['08:00'],
        status: 'active',
      });
    },
  );
  expect(admission.quote.includedTransport).toEqual([
    { id: expect.any(String), name: 'Campus shuttle' },
  ]);
  const url = `/v1/me/stays/${admission.stay.stayId}/transport`;
  const available = transportRouteListSchema.parse(
    (await h.get(url + '/routes', h.fixture().customerAToken)).json(),
  );
  expect(available.data).toMatchObject([{ name: 'Campus shuttle', residentInclusion: 'included' }]);
  expect(await h.charges(admission.stay.stayId, 'transport')).toEqual([]);
});

it('SEC-001 / CHG-042: a manager loses fee and rider access when the finance grant is revoked', async () => {
  const { connection, customerB, customerBToken, ownerId, inventory } = h.fixture();
  const { branchId } = await inventory();
  const assignmentId = randomUUID();
  await connection.db.insert(managerAssignments).values({
    id: assignmentId,
    branchId,
    userId: customerB,
    status: 'active',
    appointedByUserId: ownerId,
    activatedAt: h.clock(),
  });
  const base = `/v1/branches/${branchId}/transport`;
  const policyId = randomUUID();
  await connection.db.insert(billingPolicies).values({
    id: policyId,
    branchId,
    policy: withTransportFees,
    isCurrent: true,
    createdByUserId: ownerId,
  });
  const policyUrl = `/v1/branches/${branchId}/billing-policy/transport`;
  const policyKey = randomUUID();
  const setPolicy = () =>
    h.fixture().application.inject({
      method: 'PUT',
      url: policyUrl,
      headers: { authorization: 'Bearer ' + customerBToken, 'Idempotency-Key': policyKey },
      payload: {
        policyVersionId: policyId,
        transportBilling: { dueDay: 9, refundable: false, proration: { kind: 'full_period' } },
      },
    });
  expect((await h.get(base + '/subscriptions', customerBToken)).statusCode).toBe(403);
  await connection.db.insert(managerInventoryGrants).values({
    assignmentId,
    permission: 'finance_view',
    grantedAt: h.clock(),
  });
  expect((await h.get(base + '/subscriptions', customerBToken)).statusCode).toBe(200);
  expect((await setPolicy()).statusCode).toBe(403);
  await connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'rent_manage', grantedAt: h.clock() });
  const authorized = await setPolicy();
  expect(authorized.statusCode, authorized.body).toBe(200);
  expect(billingPolicyVersionSchema.parse(authorized.json()).policy).toMatchObject({
    ...withTransportFees,
    transportBilling: { dueDay: 9, refundable: false },
  });
  expect((await h.get(base + '/overview', customerBToken)).json()).toMatchObject({
    monthlyChargesPaisa: 0,
  });
  await connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect((await setPolicy()).statusCode).toBe(403);
  expect((await h.get(base + '/subscriptions', customerBToken)).statusCode).toBe(403);
  expect((await h.get(base + '/overview', customerBToken)).json()).toMatchObject({
    monthlyChargesPaisa: null,
  });
  const foreign = await inventory();
  expect(
    (await h.get(`/v1/branches/${foreign.branchId}/transport/overview`, customerBToken)).statusCode,
  ).toBe(403);
});
