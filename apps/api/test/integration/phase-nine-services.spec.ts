import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { residentBillingSchedules } from '@hsm/db';
import {
  branchMenuSchema,
  transportRouteSchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import { lifecycleHarness, withTransportFees } from './phase-nine-fixture.js';
const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
const put = (url: string, payload: Record<string, unknown>, token?: string) =>
  h.fixture().application.inject({
    method: 'PUT',
    url,
    headers: {
      authorization: 'Bearer ' + (token ?? h.fixture().ownerToken),
      'Idempotency-Key': crypto.randomUUID(),
    },
    payload,
  });
it('SERV-001: staff replace the weekly menu by version; residents read it; others cannot write', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-08-25');
  await h.configureTransport(item.branchId);
  const url = `/v1/branches/${item.branchId}/menu`;
  expect(branchMenuSchema.parse((await h.get(url)).json())).toMatchObject({
    version: 0,
    items: [],
  });
  const items = [
    { dayOfWeek: 1, meal: 'breakfast', description: 'Paratha + Tea' },
    { dayOfWeek: 1, meal: 'dinner', description: 'Chicken Karahi' },
  ];
  const saved = await put(url, { expectedVersion: 0, items });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await put(url, { expectedVersion: 0, items })).statusCode).toBe(409);
  const own = branchMenuSchema.parse(
    (await h.get(`/v1/me/stays/${stay.stayId}/menu`, h.fixture().customerAToken)).json(),
  );
  expect(own).toMatchObject({
    version: 1,
    items: expect.arrayContaining([expect.objectContaining({ description: 'Chicken Karahi' })]),
  });
  expect(
    (await put(url, { expectedVersion: 1, items: [] }, h.fixture().customerAToken)).statusCode,
  ).toBe(403);
  expect(
    (await h.get(`/v1/me/stays/${stay.stayId}/menu`, h.fixture().customerBToken)).statusCode,
  ).toBe(404);
  const foreign = await h.fixture().inventory();
  expect(
    (
      await put(
        `/v1/branches/${foreign.branchId}/menu`,
        { expectedVersion: 0, items },
        h.fixture().customerAToken,
      )
    ).statusCode,
  ).toBe(403);
  // CHG-037: a dishes-only save (no `times`) keeps the meal times the Owner set in Setup.
  const dinner = { dayOfWeek: 1, meal: 'dinner', startsAt: '20:00', endsAt: '22:00' };
  expect((await put(url, { expectedVersion: 1, items, times: [dinner] })).statusCode).toBe(200);
  expect((await put(url, { expectedVersion: 2, items: items.slice(0, 1) })).statusCode).toBe(200);
  expect(branchMenuSchema.parse((await h.get(url)).json())).toMatchObject({
    version: 3,
    items: [expect.objectContaining({ description: 'Paratha + Tea' })],
    times: [dinner],
  });
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
it('SERV-002 / P9-M5: approved transport bills only covered days through the shared schedule', async () => {
  const { item, stay, base } = await h.admitted(withTransportFees, '2026-10-25');
  await h.configureTransport(item.branchId);
  const route = transportRouteSchema.parse(
    await h.ok(`/v1/branches/${item.branchId}/transport/routes`, {
      name: 'F-6 to NUST',
      monthlyChargePaisa: 310000,
      departureTimes: ['07:30', '17:00'],
      stops: ['F-6 Markaz', 'NUST Gate 1'],
    }),
  );
  const own = `/v1/me/stays/${stay.stayId}/transport/subscriptions`;
  const stale = await h.send(
    own,
    { routeId: route.id, monthlyChargePaisa: 300000 },
    h.fixture().customerAToken,
  );
  expect(stale.statusCode).toBe(409);
  const requested = transportSubscriptionSchema.parse(
    await h.ok(own, { routeId: route.id, monthlyChargePaisa: 310000 }, h.fixture().customerAToken),
  );
  expect(
    (
      await h.send(
        own,
        { routeId: route.id, monthlyChargePaisa: 310000 },
        h.fixture().customerAToken,
      )
    ).statusCode,
  ).toBe(409);
  const decide = (body: Record<string, unknown>) =>
    h.send(`/v1/branches/${item.branchId}/transport/subscriptions/${requested.id}/decision`, body);
  const active = transportSubscriptionSchema.parse(
    await h.ok(`/v1/branches/${item.branchId}/transport/subscriptions/${requested.id}/decision`, {
      decision: 'approve',
      expectedVersion: 1,
      effectiveFrom: '2026-07-10',
    }),
  );
  expect(active).toMatchObject({
    status: 'active',
    effectiveFrom: '2026-07-10',
    monthlyChargePaisa: 310000,
  });
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
  expect(schedule).toMatchObject({ state: 'active', periodIndex: 1n });
  // July: 22 of 31 days covered; duplicate concurrent delivery posts once.
  await h.moveTo('2026-07-06T10:00:00Z');
  await Promise.all([
    h.deliver(schedule?.currentJobId ?? null),
    h.deliver(schedule?.currentJobId ?? null),
  ]);
  const july = await h.charges(stay.stayId, 'transport');
  expect(july.map((row) => [row.periodStart, Number(row.amountPaisa)])).toEqual([
    ['2026-07-01', 220000],
  ]);
  // An end inside the invoiced July period is refused; a later end stops future charges.
  expect(
    (await decide({ decision: 'end', expectedVersion: 2, effectiveTo: '2026-07-20' })).statusCode,
  ).toBe(409);
  await h.ok(`/v1/branches/${item.branchId}/transport/subscriptions/${requested.id}/decision`, {
    decision: 'end',
    expectedVersion: 2,
    effectiveTo: '2026-08-20',
  });
  const [next] = await h
    .fixture()
    .connection.db.select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, schedule?.id ?? ''));
  await h.moveTo('2026-08-06T10:00:00Z');
  await h.deliver(next?.currentJobId ?? null);
  const [after] = await h
    .fixture()
    .connection.db.select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, schedule?.id ?? ''));
  await h.moveTo('2026-09-06T10:00:00Z');
  await h.deliver(after?.currentJobId ?? null);
  const charges = await h.charges(stay.stayId, 'transport');
  expect(charges.map((row) => [row.periodStart, Number(row.amountPaisa)])).toEqual([
    ['2026-07-01', 220000],
    ['2026-08-01', 190000],
  ]);
  // A foreign Owner/branch cannot decide; residents cannot see other Stays' requests.
  const foreign = await h.fixture().inventory();
  expect(
    (
      await h.send(
        `/v1/branches/${foreign.branchId}/transport/subscriptions/${requested.id}/decision`,
        { decision: 'reject', expectedVersion: 3, reason: 'x' },
      )
    ).statusCode,
  ).toBe(404);
  expect((await h.get(own, h.fixture().customerBToken)).statusCode).toBe(404);
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
  expect(
    (
      await h.send(
        own,
        { routeId: route.id, monthlyChargePaisa: 310000 },
        h.fixture().customerAToken,
      )
    ).statusCode,
  ).toBe(403);
});
