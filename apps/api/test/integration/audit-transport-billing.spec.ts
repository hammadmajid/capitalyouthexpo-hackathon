import { afterAll, beforeAll, expect, it } from 'vitest';
import { transportRouteSchema, transportSubscriptionSchema } from '@hsm/contracts';
import { lifecycleHarness, withTransportFees } from './phase-nine-fixture.js';
const h = lifecycleHarness({ preScannedInventory: true });
beforeAll(() => h.start());
afterAll(() => h.close());
it('AUD-015 / SERV-002 / RENT-004 / ACC-004: transport end racing billing either prorates the unbilled period or rejects a retrospective end', async () => {
  const { item, stay } = await h.admitted(withTransportFees, '2026-08-25');
  await h.configureTransport(item.branchId);
  const route = transportRouteSchema.parse(
    await h.ok(`/v1/branches/${item.branchId}/transport/routes`, {
      name: 'Transport race fixture',
      monthlyChargePaisa: 310000,
      departureTimes: ['07:30'],
      stops: ['Fixture campus'],
    }),
  );
  const subscription = transportSubscriptionSchema.parse(
    await h.ok(
      `/v1/me/stays/${stay.stayId}/transport/subscriptions`,
      { routeId: route.id, monthlyChargePaisa: 310000 },
      h.fixture().customerAToken,
    ),
  );
  const decision = `/v1/branches/${item.branchId}/transport/subscriptions/${subscription.id}/decision`;
  await h.ok(decision, { decision: 'approve', expectedVersion: 1, effectiveFrom: '2026-07-01' });
  const schedule = (await h.schedules(stay.stayId)).find((row) => row.item === 'transport');
  expect(schedule).toMatchObject({ state: 'active', periodIndex: 1n });
  await h.moveTo('2026-07-06T10:00:00Z');
  const [ended] = await Promise.all([
    h.send(decision, { decision: 'end', expectedVersion: 2, effectiveTo: '2026-07-20' }),
    h.deliver(schedule?.currentJobId ?? null),
  ]);
  expect([200, 409]).toContain(ended.statusCode);
  const charges = await h.charges(stay.stayId, 'transport');
  expect(charges).toHaveLength(1);
  expect(charges[0]?.periodStart).toBe('2026-07-01');
  expect(charges[0]?.amountPaisa).toBe(ended.statusCode === 200 ? 190000n : 310000n);
  const page = await h.get(`/v1/branches/${item.branchId}/transport/subscriptions`);
  expect(page.statusCode).toBe(200);
  const current = (
    page.json() as { data: { id: string; status: string; effectiveTo: string | null }[] }
  ).data.find((row) => row.id === subscription.id);
  expect(current).toMatchObject(
    ended.statusCode === 200
      ? { status: 'ended', effectiveTo: '2026-07-20' }
      : { status: 'active', effectiveTo: null },
  );
  if (ended.statusCode === 409)
    await h.ok(decision, { decision: 'end', expectedVersion: 2, effectiveTo: '2026-08-20' });
  // A replayed persisted July job cannot add a second charge after either serialized outcome.
  await h.deliver(schedule?.currentJobId ?? null);
  expect(await h.charges(stay.stayId, 'transport')).toEqual(charges);
});
