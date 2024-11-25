import { addRentDays } from '@hsm/contracts';
import { dashboardQueuePath } from '../../src/lib/dashboard-queue-path';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Page } from '@playwright/test';
import {
  inventoryClaims,
  notificationOutbox,
  residentBillingSchedules,
  residentInvoices,
  roomTypes,
  rooms,
  seats,
  stayAgreements,
  stayFinalStatements,
  stays,
  type Database,
} from '@hsm/db';
import { test, expect } from './fixture';
import { admitResident, command } from './payments-setup';
async function openStaffStay(page: Page, branchId: string) {
  await page.goto('/app');
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(branchId);
  await page.getByRole('button', { name: 'Residents and stays' }).click();
  await page.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
}
// RENT-004: billing runs on its due date; the browser journey checks the live schedule the
// worker will execute (actual posting under a controlled clock is the real-PostgreSQL suite).
async function liveSchedules(db: Database, stayId: string) {
  return db
    .select()
    .from(residentBillingSchedules)
    .where(
      and(
        eq(residentBillingSchedules.stayId, stayId),
        eq(residentBillingSchedules.state, 'active'),
      ),
    );
}
const invoices = (db: Database, stayId: string) =>
  db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, stayId))
    .orderBy(asc(residentInvoices.dueDate));
async function checkout(
  context: Parameters<typeof command>[0],
  origin: string,
  branchId: string,
  stayId: string,
  db: Database,
  applyAvailableDeposit = false,
) {
  const [row] = await db.select({ version: stays.version }).from(stays).where(eq(stays.id, stayId));
  return command(context, origin, `/api/v1/branches/${branchId}/stays/${stayId}/checkout`, {
    expectedVersion: row?.version,
    reason: 'Moved out',
    applyAvailableDeposit,
  });
}
test('Journey 1 / P9-FIX-01: a differently priced transfer amends rent from the first unbilled period', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, invoice, owner, customer } = await admitResident(page, browser, stack);
  const [room] = await db.select().from(rooms).where(eq(rooms.id, data.roomId));
  await db
    .update(roomTypes)
    .set({ capacity: 2 })
    .where(eq(roomTypes.id, room?.roomTypeId ?? ''));
  await db.insert(seats).values({
    id: randomUUID(),
    branchId: data.branchId,
    roomId: data.roomId,
    ordinal: 2,
    label: 'B',
    status: 'active',
  });
  await openStaffStay(page, data.branchId);
  await page.getByLabel('Lifecycle reason').fill('Moved to a larger bed');
  await page.getByLabel('Transfer target bed').selectOption({ label: '501 · B' });
  await page.getByLabel(/Change the monthly rent/).check();
  await page.getByLabel('New monthly rent (PKR)').fill('23000');
  await expect(page.getByRole('button', { name: 'Transfer resident' })).toBeDisabled();
  await page.getByLabel(/The resident agreed/).check();
  await page.getByRole('button', { name: 'Transfer resident' }).click();
  await expect(page.getByText('active → active (transfer)', { exact: false })).toBeVisible();
  const agreements = await db
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.stayId, stay.id));
  expect(agreements.map((row) => Number(row.rentAmountPaisa)).sort()).toEqual([1800000, 2300000]);
  const amended = agreements.find((row) => Number(row.rentAmountPaisa) === 2300000);
  const live = await liveSchedules(db, stay.id);
  expect(live.map((row) => row.agreementId)).toEqual([amended?.id]);
  expect(live[0]?.nextRunAt?.toISOString().slice(0, 10)).toBe(
    amended?.effectiveFrom.slice(0, 8) + '05',
  );
  expect(await invoices(db, stay.id)).toEqual([invoice]);
  await checkout(owner, stack.origin, data.branchId, stay.id, db);
  await customer.close();
});
test('Journey 2 / P9-FIX-02: extending after billing ran out resumes billing exactly once', async ({
  page,
  browser,
  stack,
}) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const [year, month] = today.split('-').map(Number) as [number, number];
  const endOfMonth = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const { db, data, stay, owner, customer } = await admitResident(page, browser, stack, {
    moveOutDate: endOfMonth,
  });
  const [before] = await db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.stayId, stay.id));
  expect(before?.state).toBe('exhausted');
  const extended = new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10);
  await openStaffStay(page, data.branchId);
  await page.getByLabel('Lifecycle reason').fill('Semester extended');
  await page.getByLabel('New expected departure').fill(extended);
  await page.getByRole('button', { name: 'Change departure date' }).click();
  await expect(page.getByText('active → active (extension)', { exact: false })).toBeVisible();
  const resumed = await liveSchedules(db, stay.id);
  expect(resumed).toHaveLength(1);
  expect(resumed[0]).toMatchObject({ id: before?.id, periodIndex: before?.periodIndex });
  const jobs = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, resumed[0]?.currentJobId ?? ''));
  expect(jobs.map((row) => row.status)).toEqual(['pending']);
  await checkout(owner, stack.origin, data.branchId, stay.id, db);
  await customer.close();
});
test('Journey 3+4 / P9-FIX-03/04: deposit applied once at checkout; later refund shown beside the frozen statement', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, invoice, owner, customer, customerPage } = await admitResident(
    page,
    browser,
    stack,
    {
      moveOutDate: addRentDays(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
        10n,
      ),
    },
  );
  await command(
    owner,
    stack.origin,
    `/api/v1/branches/${data.branchId}/stays/${stay.id}/payments`,
    {
      amountPaisa: 1000000,
      method: 'cash',
      paidOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
      note: 'Part rent and deposit',
      allocations: [{ invoiceId: invoice.id, amountPaisa: 500000 }],
      depositPaisa: 500000,
      advanceCreditPaisa: 0,
    },
  );
  await page.goto(dashboardQueuePath('owner', 'checkouts', data.branchId));
  await page.getByRole('button', { name: 'Open checkout for Browser booking Customer' }).click();
  await page.getByLabel('Lifecycle reason').fill('Leaving after exams');
  await page.getByLabel(/Apply the held deposit/).check();
  await page.getByRole('button', { name: 'Complete checkout' }).click();
  await expect(page.getByText('No items are waiting in this queue.')).toBeVisible();
  await openStaffStay(page, data.branchId);
  await expect(page.getByText('active → completed (checkout)', { exact: false })).toBeVisible();
  const [closedStay] = await db
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, stay.id));
  expect(closedStay?.snapshot).toMatchObject({
    deposit: { appliedToRentPaisa: 500000, heldPaisa: 0 },
    outstandingPaisa: 800000,
  });
  const claims = await db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.roomId, data.roomId), isNull(inventoryClaims.releasedAt)));
  expect(claims).toHaveLength(0);
  expect(
    await db.select().from(stayFinalStatements).where(eq(stayFinalStatements.stayId, stay.id)),
  ).toHaveLength(1);
  // Journey 4: a second Stay keeps its deposit; the refund is recorded after checkout.
  await customer.close();
  const second = await admitResident(page, browser, stack);
  await command(
    second.owner,
    stack.origin,
    `/api/v1/branches/${second.data.branchId}/stays/${second.stay.id}/payments`,
    {
      amountPaisa: 2300000,
      method: 'cash',
      paidOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
      note: 'Rent and deposit',
      allocations: [{ invoiceId: second.invoice.id, amountPaisa: 1800000 }],
      depositPaisa: 500000,
      advanceCreditPaisa: 0,
    },
  );
  await checkout(second.owner, stack.origin, second.data.branchId, second.stay.id, db);
  const [frozen] = await db
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, second.stay.id));
  await openStaffStay(page, second.data.branchId);
  await page.getByLabel('Refund source payment').selectOption({ index: 1 });
  await page.getByLabel('Refund amount (PKR)').fill('2000');
  await page.getByLabel('Refund reference (optional)').fill('BANK-77');
  await page.getByLabel('Refund reason').fill('Deposit returned');
  await page.getByRole('button', { name: 'Record refund' }).click();
  await expect(page.getByText('Refund recorded.')).toBeVisible();
  const resident = second.customerPage;
  await resident.goto('/app');
  await resident.getByRole('button', { name: 'My stays' }).click();
  await resident.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
  await expect(resident.getByText(/Deposit refund recorded PKR 2,000 · ref BANK-77/)).toBeVisible();
  await expect(resident.getByText(/refund still owed by the hostel PKR 3,000/)).toBeVisible();
  const [unchanged] = await db
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, second.stay.id));
  expect(unchanged?.snapshot).toEqual(frozen?.snapshot);
  void customerPage;
  await second.customer.close();
});
