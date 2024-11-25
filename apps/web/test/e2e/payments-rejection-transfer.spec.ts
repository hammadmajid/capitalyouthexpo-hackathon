import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Page } from '@playwright/test';
import {
  residentPayments,
  residentReceipts,
  roomTypes,
  rooms,
  seats,
  stayAssignments,
  type Database,
} from '@hsm/db';
import { test, expect } from './fixture';
import { admitResident } from './payments-setup';
async function submitProof(page: Page, invoiceId: string, amount: string, today: string) {
  await page.reload();
  await page.getByRole('button', { name: 'My stays' }).click();
  await page.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
  await page.getByRole('button', { name: 'Pay rent' }).click();
  await page.getByLabel('Invoice to pay').selectOption(invoiceId);
  await page.getByLabel('Amount paid (PKR)').fill(amount);
  await page.getByLabel('Payment date').fill(today);
  await page.getByLabel('Payment proof (screenshot or receipt)').setInputFiles({
    name: 'rent-' + randomUUID() + '.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nrent proof ' + randomUUID() + '\n'),
  });
  await expect(page.getByText('File checked and ready.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit payment proof' }).click();
  await expect(page.getByText('Proof submitted: pending verification.')).toBeVisible();
}
// RES-005: staff move the resident to another available bed in the same branch.
async function transferToSecondBed(
  page: Page,
  db: Database,
  branchId: string,
  roomId: string,
  stayId: string,
) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  await db
    .update(roomTypes)
    .set({ capacity: 2 })
    .where(eq(roomTypes.id, room?.roomTypeId ?? ''));
  const targetSeatId = randomUUID();
  await db.insert(seats).values({
    id: targetSeatId,
    branchId: branchId,
    roomId: roomId,
    ordinal: 2,
    label: 'B',
    status: 'active',
  });
  await page.getByRole('button', { name: 'Residents and stays' }).click();
  await page.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
  await page.getByLabel('Lifecycle reason').fill('Requested a quieter bed');
  await page.getByLabel('Transfer target bed').selectOption({ label: '501 · B' });
  await page.getByRole('button', { name: 'Transfer resident' }).click();
  await expect(page.getByText('active → active (transfer)', { exact: false })).toBeVisible();
  const open = await db
    .select()
    .from(stayAssignments)
    .where(and(eq(stayAssignments.stayId, stayId), isNull(stayAssignments.endedAt)));
  expect(open.map((assignment) => assignment.seatId)).toEqual([targetSeatId]);
}
test('PAY-006 / PAY-007 / RES-005: real browser proof rejection, partial payment and bed transfer', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, today, customer, customerPage, stay, invoice } = await admitResident(
    page,
    browser,
    stack,
  );
  const payments = () =>
    db.select().from(residentPayments).where(eq(residentPayments.stayId, stay.id));
  // PAY-006: a rejected proof records no payment and the resident sees the reason.
  await submitProof(customerPage, invoice.id, '18000', today);
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(data.branchId);
  await page.getByRole('button', { name: 'Review payment proofs' }).click();
  await page.getByRole('button', { name: 'Reject proof for Browser booking Customer' }).click();
  await page.getByLabel('Rejection reason').fill('Amount not received in account');
  await page.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(page.getByText('Proof rejected; the invoice remains unpaid.')).toBeVisible();
  expect(await payments()).toHaveLength(0);
  await customerPage.reload();
  await customerPage.getByRole('button', { name: 'My stays' }).click();
  await customerPage
    .getByRole('button', { name: 'View stay for Browser booking Customer' })
    .click();
  await customerPage.getByRole('button', { name: 'Pay rent' }).click();
  await expect(
    customerPage.getByText(/Not accepted.*Amount not received in account/),
  ).toBeVisible();
  // PAY-007: an approved partial proof leaves the invoice Partially paid.
  await submitProof(customerPage, invoice.id, '5000', today);
  await page.reload();
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(data.branchId);
  await page.getByRole('button', { name: 'Review payment proofs' }).click();
  await page.getByRole('button', { name: 'Approve payment for Browser booking Customer' }).click();
  await expect(page.getByText('Payment recorded and receipt issued.')).toBeVisible();
  const [partial] = await payments();
  expect(partial?.amountPaisa).toBe(500000n);
  expect(
    await db.select().from(residentReceipts).where(eq(residentReceipts.stayId, stay.id)),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'View Rent Board' }).click();
  const rent = page.getByRole('region', { name: 'Rent Board' });
  await rent.getByLabel('Billing month').fill(invoice.dueDate.slice(0, 7));
  // RENT-003: due on the 5th with no grace, so the open balance shows as Overdue, not Paid.
  await expect(rent.getByText(/outstanding PKR 13,000 · Overdue/)).toBeVisible();
  await transferToSecondBed(page, db, data.branchId, data.roomId, stay.id);
  await customer.close();
});
