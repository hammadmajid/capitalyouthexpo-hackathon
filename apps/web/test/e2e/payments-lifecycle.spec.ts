import { eq } from 'drizzle-orm';
import {
  inventoryClaims,
  residentPayments,
  residentReceipts,
  stayFinalStatements,
  stays,
} from '@hsm/db';
import { test, expect } from './fixture';
import { admitResident } from './payments-setup';
test('PAY-001..009 / OUT-001..006: real browser rent proof, approval, receipt, checkout and Past Stay', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, today, customer, customerPage, stay, invoice } = await admitResident(
    page,
    browser,
    stack,
  );
  // PAY-001..003: the resident sees the branch account and submits a proof.
  await customerPage.goto('/app');
  await customerPage.getByRole('button', { name: 'My stays' }).click();
  await customerPage
    .getByRole('button', { name: 'View stay for Browser booking Customer' })
    .click();
  await customerPage.getByRole('button', { name: 'Pay rent' }).click();
  await expect(customerPage.getByText(/Payments Fixture Hostel · PK00PAYMENTS/)).toBeVisible();
  await customerPage.getByLabel('Invoice to pay').selectOption(invoice.id);
  await customerPage.getByLabel('Amount paid (PKR)').fill('18000');
  await customerPage.getByLabel('Payment date').fill(today);
  await customerPage.getByLabel('Payment proof (screenshot or receipt)').setInputFiles({
    name: 'rent.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nrent proof\n'),
  });
  await expect(customerPage.getByText('File checked and ready.', { exact: true })).toBeVisible();
  await customerPage.getByRole('button', { name: 'Submit payment proof' }).click();
  await expect(customerPage.getByText('Proof submitted: pending verification.')).toBeVisible();
  await expect(customerPage.getByText(/Pending verification by the hostel/)).toBeVisible();
  expect(
    await db.select().from(residentPayments).where(eq(residentPayments.stayId, stay.id)),
  ).toHaveLength(0);
  // PAY-004..009: the Owner approves; one payment and one receipt; Rent Board shows Paid.
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(data.branchId);
  await page.getByRole('button', { name: 'Review payment proofs' }).click();
  await page.getByRole('button', { name: 'Approve payment for Browser booking Customer' }).click();
  await expect(page.getByText('Payment recorded and receipt issued.')).toBeVisible();
  expect(
    await db.select().from(residentPayments).where(eq(residentPayments.stayId, stay.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(residentReceipts).where(eq(residentReceipts.stayId, stay.id)),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'View Rent Board' }).click();
  const rent = page.getByRole('region', { name: 'Rent Board' });
  await rent.getByLabel('Billing month').fill(invoice.dueDate.slice(0, 7));
  await expect(rent.getByText('Status: Paid', { exact: true })).toBeVisible();
  // The resident downloads the receipt PDF from the authenticated route.
  await customerPage.reload();
  await customerPage.getByRole('button', { name: 'My stays' }).click();
  await customerPage
    .getByRole('button', { name: 'View stay for Browser booking Customer' })
    .click();
  await customerPage.getByRole('button', { name: 'Pay rent' }).click();
  const link = customerPage.getByRole('link', { name: 'Download receipt PDF' });
  const pdf = await customer.request.get((await link.getAttribute('href')) ?? '');
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  // OUT-006: the Owner completes checkout; the bed is released and the statement frozen.
  await page.getByRole('button', { name: 'Residents and stays' }).click();
  await page.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
  await page.getByLabel('Lifecycle reason').fill('Moved out after semester');
  await page.getByRole('button', { name: 'Complete checkout' }).click();
  await expect(page.getByText('active → completed (checkout)', { exact: false })).toBeVisible();
  const [closed] = await db.select().from(stays).where(eq(stays.id, stay.id));
  expect(closed?.state).toBe('completed');
  const claims = await db
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.roomId, data.roomId));
  expect(claims.every((claim) => claim.releasedAt !== null)).toBe(true);
  expect(
    await db.select().from(stayFinalStatements).where(eq(stayFinalStatements.stayId, stay.id)),
  ).toHaveLength(1);
  // STAY-004: the resident sees the Past Stay with its final statement.
  await customerPage.reload();
  await customerPage.getByRole('button', { name: 'My stays' }).click();
  await customerPage
    .getByRole('button', { name: 'View stay for Browser booking Customer' })
    .click();
  await expect(customerPage.getByRole('heading', { name: 'Final statement' })).toBeVisible();
  expect(
    (await customer.request.get(`/api/v1/branches/${data.branchId}/rent-board`)).status(),
  ).toBe(403);
  await customer.close();
});
