import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { asc, desc, eq } from 'drizzle-orm';
import {
  billingPolicies,
  includedTransportRoutes,
  managerAssignments,
  managerInventoryGrants,
  stayAgreements,
  transportSubscriptions,
} from '@hsm/db';
import {
  manualAdmissionResultSchema,
  transportRouteListSchema,
  transportRouteSchema,
  transportSubscriptionPageSchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import { lifecycleHarness, withTransportFees } from './phase-nine-fixture.js';
import { admitResident, manualAdmissionFixture } from './manual-admission.fixture.js';
const h = lifecycleHarness({ preScannedInventory: true });
beforeAll(() => h.start());
afterAll(() => h.close());
const common = { stops: ['Hostel'], departureTimes: ['08:00'] };
const own = (stayId: string) => `/v1/me/stays/${stayId}/transport`;
async function myRoutes(stayId: string) {
  return transportRouteListSchema.parse(
    (await h.get(own(stayId) + '/routes', h.fixture().customerAToken)).json(),
  );
}
const put = (url: string, payload: Record<string, unknown>) =>
  h.fixture().application.inject({
    method: 'PUT',
    url,
    headers: {
      authorization: 'Bearer ' + h.fixture().ownerToken,
      'Idempotency-Key': randomUUID(),
    },
    payload,
  });
it('CHG-042: a rent change (new agreement version) keeps transport included from the booking', async () => {
  const admission = await h.admitted(
    { ...withTransportFees, transportBilling: { offer: { mode: 'included' } } },
    '2026-10-25',
    async (branch) => {
      await h.ok(`/v1/branches/${branch}/transport/routes`, {
        ...common,
        name: 'Campus shuttle',
        status: 'active',
      });
    },
  );
  const stayId = admission.stay.stayId;
  const [latest] = await h
    .fixture()
    .connection.db.select()
    .from(stayAgreements)
    .where(eq(stayAgreements.stayId, stayId))
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  if (!latest) throw new Error('agreement missing');
  // Repricing writes a new version without the booking snapshot.
  await h
    .fixture()
    .connection.db.insert(stayAgreements)
    .values({
      ...latest,
      id: randomUUID(),
      version: latest.version + 1,
      bookingSnapshot: null,
      reason: 'Rent changed',
    });
  const mine = await myRoutes(stayId);
  expect(mine.data).toMatchObject([{ name: 'Campus shuttle', residentInclusion: 'included' }]);
  expect(mine.offer).toEqual({ mode: 'included' });
  expect(
    (
      await h.send(
        own(stayId) + '/subscriptions',
        { monthlyChargePaisa: 1 },
        h.fixture().customerAToken,
      )
    ).statusCode,
  ).toBe(409);
  await h.ok(admission.base + '/checkout', {
    expectedVersion: await h.version(stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
it('CHG-046: a walk-in with a room-type rent override keeps its agreed routes', async () => {
  const f = h.fixture();
  const item = await manualAdmissionFixture(f);
  const url = `/v1/branches/${item.branchId}/transport/routes`;
  await h.configureTransport(item.branchId, { offer: { mode: 'included' } });
  const policyVersionId = randomUUID();
  const policy = { ...item.input.manual.terms.policy, graceDays: 2 };
  await f.connection.db.insert(billingPolicies).values({
    id: policyVersionId,
    branchId: item.branchId,
    roomTypeId: item.roomTypeId,
    policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  const route = (name: string) => h.ok(url, { ...common, name });
  const day = (offset: number) =>
    new Date(Date.parse(h.date() + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  // The walk-in agreement starts today (move-in).
  const before = transportRouteSchema.parse(await route('Before admission'));
  const body = {
    ...item.input,
    manual: {
      ...item.input.manual,
      terms: { ...item.input.manual.terms, policyVersionId, policy },
      period: { moveInDate: day(0), expectedLeaveDate: day(30) },
    },
  };
  const admitted = await admitResident(f, item, randomUUID(), f.ownerToken, body);
  expect(admitted.statusCode, admitted.body).toBe(201);
  const stay = manualAdmissionResultSchema.parse(admitted.json());
  const [agreement] = await f.connection.db
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, stay.agreementId));
  expect(agreement?.termsSnapshot.policy).toEqual(policy);
  expect(agreement?.transportBillingSnapshot).toEqual({ offer: { mode: 'included' } });
  await route('After admission');
  await h.configureTransport(item.branchId);
  const included = await includedTransportRoutes(f.connection.db, item.branchId, stay.stayId);
  expect([...included]).toEqual([before.id]);
});
it('CHG-042: the chosen route is kept, guards its archive, and checkout closes transport', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-10-25');
  await h.configureTransport(item.branchId);
  const url = `/v1/branches/${item.branchId}/transport/routes`;
  const first = transportRouteSchema.parse(
    await h.ok(url, { ...common, name: 'Paid A', monthlyChargePaisa: 310000 }),
  );
  const second = transportRouteSchema.parse(
    await h.ok(url, { ...common, name: 'Paid B', monthlyChargePaisa: 310000 }),
  );
  const token = h.fixture().customerAToken;
  const requested = transportSubscriptionSchema.parse(
    await h.ok(
      own(stay.stayId) + '/subscriptions',
      { routeId: second.id, monthlyChargePaisa: 310000 },
      token,
    ),
  );
  expect(requested).toMatchObject({ routeId: second.id, routeName: 'Paid B' });
  const archive = (route: typeof first) =>
    put(`${url}/${route.id}`, {
      ...common,
      name: route.name,
      monthlyChargePaisa: 310000,
      expectedVersion: route.version,
      status: 'inactive',
    });
  // CHG-045: archiving the rider's route moves them to the remaining paid route; the last
  // paid route cannot go while riders remain.
  expect((await archive(second)).statusCode).toBe(200);
  const [moved] = await h
    .fixture()
    .connection.db.select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.id, requested.id));
  expect(moved).toMatchObject({ routeId: first.id, version: 2 });
  expect((await archive(first)).statusCode).toBe(409);
  await h.ok(`/v1/branches/${item.branchId}/transport/subscriptions/${requested.id}/decision`, {
    decision: 'approve',
    expectedVersion: 2,
    effectiveFrom: h.date(),
  });
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
  const [closed] = await h
    .fixture()
    .connection.db.select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.id, requested.id));
  expect(closed).toMatchObject({ status: 'ended', reason: 'Checked out' });
  expect(
    closed?.effectiveTo && closed.effectiveFrom && closed.effectiveTo > closed.effectiveFrom,
  ).toBe(true);
});
it('CHG-042: checkout withdraws a pending request', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-10-25');
  await h.configureTransport(item.branchId);
  await h.ok(`/v1/branches/${item.branchId}/transport/routes`, {
    ...common,
    name: 'Paid',
    monthlyChargePaisa: 310000,
  });
  const requested = transportSubscriptionSchema.parse(
    await h.ok(
      own(stay.stayId) + '/subscriptions',
      { monthlyChargePaisa: 310000 },
      h.fixture().customerAToken,
    ),
  );
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
  const rows = await h
    .fixture()
    .connection.db.select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.stayId, stay.stayId))
    .orderBy(asc(transportSubscriptions.id));
  expect(rows.map((row) => [row.id, row.status])).toEqual([[requested.id, 'withdrawn']]);
});
it('SERV-002 / CHG-042: a Manager with the decision grants sees requests without invoices', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-10-25');
  await h.configureTransport(item.branchId);
  await h.ok(`/v1/branches/${item.branchId}/transport/routes`, {
    ...common,
    name: 'Paid',
    monthlyChargePaisa: 310000,
  });
  await h.ok(
    own(stay.stayId) + '/subscriptions',
    { monthlyChargePaisa: 310000 },
    h.fixture().customerAToken,
  );
  const { connection, customerB, customerBToken, ownerId } = h.fixture();
  const assignmentId = randomUUID();
  await connection.db.insert(managerAssignments).values({
    id: assignmentId,
    branchId: item.branchId,
    userId: customerB,
    status: 'active',
    appointedByUserId: ownerId,
    activatedAt: h.clock(),
  });
  const list = `/v1/branches/${item.branchId}/transport/subscriptions`;
  expect((await h.get(list, customerBToken)).statusCode).toBe(403);
  await connection.db.insert(managerInventoryGrants).values(
    (['stay_manage', 'rent_manage'] as const).map((permission) => ({
      assignmentId,
      permission,
      grantedAt: h.clock(),
    })),
  );
  const page = transportSubscriptionPageSchema.parse((await h.get(list, customerBToken)).json());
  expect(page.data).toHaveLength(1);
  expect(page.data[0]).toMatchObject({ status: 'requested', billing: null });
  await connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated', deactivatedAt: h.clock() })
    .where(eq(managerAssignments.id, assignmentId));
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
