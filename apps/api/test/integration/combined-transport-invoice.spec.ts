import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { roomTypes, residentInvoiceCharges } from '@hsm/db';
import {
  residentInvoiceBalanceSchema,
  transportRouteSchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import { lifecycleHarness, withTransportFees } from './phase-nine-fixture.js';
const h = lifecycleHarness({ preScannedInventory: true });
beforeAll(() => h.start());
afterAll(() => h.close());
it('SERV-002 / PAY-008: approved subscribers share one rent-dated invoice with classified rent, transport and outstanding security', async () => {
  const { item, stay, rent } = await h.admitted(
    withTransportFees,
    '2026-09-25',
    async (branchId) => {
      await h
        .fixture()
        .connection.db.update(roomTypes)
        .set({ bedMonthlyRentPaisa: 1000000n, depositPaisa: 1000000n })
        .where(eq(roomTypes.branchId, branchId));
    },
  );
  expect(rent).toBe(1000000);
  await h.configureTransport(item.branchId, {
    offer: { mode: 'separate', monthlyChargePaisa: 500000 },
    dueDay: 20,
    refundable: false,
    proration: { kind: 'full_period' },
  });
  const route = transportRouteSchema.parse(
    await h.ok(`/v1/branches/${item.branchId}/transport/routes`, {
      name: 'Campus',
      monthlyChargePaisa: 500000,
      departureTimes: [],
      stops: ['Campus'],
    }),
  );
  const request = transportSubscriptionSchema.parse(
    await h.ok(
      `/v1/me/stays/${stay.stayId}/transport/subscriptions`,
      { routeId: route.id, monthlyChargePaisa: 500000 },
      h.fixture().customerAToken,
    ),
  );
  expect(request.status).toBe('requested');
  expect(await h.charges(stay.stayId, 'transport')).toHaveLength(0);
  await h.ok(`/v1/branches/${item.branchId}/transport/subscriptions/${request.id}/decision`, {
    decision: 'approve',
    expectedVersion: request.version,
    effectiveFrom: '2026-07-01',
  });
  const jobs = (await h.schedules(stay.stayId)).filter((row) =>
    ['rent', 'transport'].includes(row.item),
  );
  await h.moveTo('2026-07-05T10:00:00Z');
  for (const job of jobs) await h.deliver(job.currentJobId);
  const invoices = (await h.invoices(stay.stayId)).filter((row) => row.dueDate === '2026-07-05');
  expect(invoices).toHaveLength(1);
  const invoice = invoices[0];
  if (!invoice) throw new Error('Combined invoice missing');
  expect(invoice.totalPaisa).toBe(1500000n);
  const links = await h
    .fixture()
    .connection.db.select()
    .from(residentInvoiceCharges)
    .where(eq(residentInvoiceCharges.invoiceId, invoice.id));
  expect(links).toHaveLength(2);
  const response = await h.get(
    `/v1/branches/${item.branchId}/stays/${stay.stayId}/invoices/${invoice.id}`,
  );
  expect(response.statusCode, response.body).toBe(200);
  const detail = residentInvoiceBalanceSchema.parse(response.json());
  expect(detail.lineItems?.map((line) => [line.kind, line.amountPaisa]).sort()).toEqual([
    ['rent', 1000000],
    ['transport', 500000],
  ]);
  expect(detail.securityDuePaisa).toBe(1000000);
  expect(detail.outstandingPaisa + (detail.securityDuePaisa ?? 0)).toBe(2500000);
  for (const job of jobs) await h.deliver(job.currentJobId);
  expect(
    (await h.invoices(stay.stayId)).filter((row) => row.dueDate === '2026-07-05'),
  ).toHaveLength(1);
});
