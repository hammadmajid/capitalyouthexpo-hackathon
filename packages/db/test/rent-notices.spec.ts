import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  deliverResidentBilling,
  notificationOutbox,
  residentInvoices,
  sweepRentOverdue,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { billingRuntimeFixture } from './resident-billing-delivery.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function rentRows(invoiceId: string) {
  return harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'resident.rent'),
        sql`${notificationOutbox.payload}->>'invoiceId' = ${invoiceId}`,
      ),
    );
}
it('RENT-001 / NTF-001: duplicate deliveries announce one issued invoice exactly once', async () => {
  const f = await billingRuntimeFixture(harness);
  await Promise.all(
    Array.from({ length: 4 }, () => deliverResidentBilling(harness.database(), f.message)),
  );
  const [invoice] = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  if (!invoice) throw new Error('Invoice missing');
  const rows = await rentRows(invoice.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    channel: 'in_app',
    recipientUserId: null,
    status: 'pending',
    dedupeKey: 'resident.rent:due:' + invoice.id,
    payload: { event: 'rent.due', stayId: f.stayId, invoiceId: invoice.id },
  });
});
it('RB-002 / NTF-003: overdue notices respect agreed grace, linked accounts and run once', async () => {
  const f = await billingRuntimeFixture(harness);
  await deliverResidentBilling(harness.database(), f.message);
  const [invoice] = await harness
    .database()
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  if (!invoice) throw new Error('Invoice missing');
  const late = new Date(invoice.dueDate + 'T12:00:00Z');
  late.setUTCDate(late.getUTCDate() + 60);
  const early = new Date(invoice.dueDate + 'T00:00:00Z');
  // The fixture Stay is explicitly linked to its Customer (immutable link, CHG-009).
  await sweepRentOverdue(harness.database(), early);
  const before = (await rentRows(invoice.id)).filter(
    (row) => (row.payload as { event: string }).event === 'rent.overdue',
  );
  expect(before).toHaveLength(0);
  await sweepRentOverdue(harness.database(), late);
  await sweepRentOverdue(harness.database(), late);
  const after = (await rentRows(invoice.id)).filter(
    (row) => (row.payload as { event: string }).event === 'rent.overdue',
  );
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({
    dedupeKey: 'resident.rent:overdue:' + invoice.id,
    payload: { event: 'rent.overdue', stayId: f.stayId, invoiceId: invoice.id },
  });
});
