import { expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  residentCharges,
  residentInvoices,
  residentLedger,
  residentBillingExecutions,
  residentBillingOrigins,
  residentBillingSchedules,
  residentPayments,
  residentReceipts,
  type Database,
} from '../src/index.js';
import type { billingRuntimeFixture } from './resident-billing-delivery.fixture.js';
export async function financialRows(db: Database, stayId: string) {
  const rows = [];
  for (const table of [
    residentCharges,
    residentInvoices,
    residentLedger,
    residentBillingExecutions,
    residentBillingOrigins,
  ])
    rows.push(await db.select().from(table).where(eq(table.stayId, stayId)).limit(2));
  return rows;
}
export async function readSchedule(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, id));
  if (!row) throw new Error('Schedule missing');
  return row;
}
export async function expectSourceProof(
  db: Database,
  f: Awaited<ReturnType<typeof billingRuntimeFixture>>,
) {
  const [charge] = await db
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.stayId, f.stayId));
  const [invoice] = await db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, f.stayId));
  const [execution] = await db
    .select()
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.stayId, f.stayId));
  const [origin] = await db
    .select()
    .from(residentBillingOrigins)
    .where(eq(residentBillingOrigins.stayId, f.stayId));
  expect(charge).toMatchObject({ postedByUserId: null, amountPaisa: 1800001n });
  expect(invoice).toMatchObject({ issuedByUserId: null, totalPaisa: 1800001n, state: 'issued' });
  expect(execution).toMatchObject({ outcome: 'posted', jobId: f.message.id });
  expect(origin).toMatchObject({
    executionId: execution?.id,
    chargeId: charge?.id,
    invoiceId: invoice?.id,
  });
}
export async function expectNoPayment(db: Database, stayId: string) {
  expect(
    await db.select().from(residentPayments).where(eq(residentPayments.stayId, stayId)),
  ).toEqual([]);
  expect(
    await db.select().from(residentReceipts).where(eq(residentReceipts.stayId, stayId)),
  ).toEqual([]);
}
