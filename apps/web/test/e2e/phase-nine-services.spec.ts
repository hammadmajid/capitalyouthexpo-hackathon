import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Page } from '@playwright/test';
import {
  complaintEvents,
  complaints,
  residentBillingSchedules,
  reviewRatings,
  reviews,
  stays,
  transportSubscriptions,
} from '@hsm/db';
import { test, expect } from './fixture';
import { admitResident, command } from './payments-setup';
import { dashboardQueuePath } from '../../src/lib/dashboard-queue-path';
// Each journey drives two browsers through a dozen page loads; on the 8 GB acceptance laptop
// that needs more than the default per-test budget (a duration limit, not a wait for state).
test.slow();
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
async function staffServices(page: Page, branchId: string) {
  await page.goto('/app');
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(branchId);
  await page
    .getByRole('button', { name: /Manage menu, transport, complaints and reviews/ })
    .click();
}
async function residentServices(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'My stays' }).click();
  await page.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
  await page.getByRole('button', { name: 'Hostel services' }).click();
}
async function checkout(
  owner: Parameters<typeof command>[0],
  origin: string,
  branchId: string,
  stayId: string,
  db: Awaited<ReturnType<typeof admitResident>>['db'],
) {
  const [row] = await db.select({ version: stays.version }).from(stays).where(eq(stays.id, stayId));
  await command(owner, origin, `/api/v1/branches/${branchId}/stays/${stayId}/checkout`, {
    expectedVersion: row?.version,
    reason: 'Moved out',
    applyAvailableDeposit: false,
  });
}
test('Journey 5 / CMP-001..006: complaint resolved, reopened, resolved again and accepted with full history', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, owner, customer, customerPage } = await admitResident(
    page,
    browser,
    stack,
  );
  await residentServices(customerPage);
  await customerPage.getByLabel('Complaint category').selectOption('plumbing');
  await customerPage.getByLabel('Complaint title').fill('Leaking tap');
  await customerPage.getByLabel('Describe the problem').fill('Bathroom tap leaks all night');
  await customerPage.getByRole('button', { name: 'Send complaint' }).click();
  await expect(customerPage.getByText('Complaint sent to the hostel.')).toBeVisible();
  const status = async () =>
    (
      await db
        .select({ status: complaints.status })
        .from(complaints)
        .where(eq(complaints.stayId, stay.id))
    )[0]?.status;
  const staffStep = async (button: string, expected: string, note?: string) => {
    await page.goto(dashboardQueuePath('owner', 'complaints', data.branchId));
    await page.getByRole('button', { name: 'Open complaint Leaking tap' }).click();
    if (note) await page.getByLabel('Complaint note').fill(note);
    await page.getByRole('button', { name: button }).click();
    await expect.poll(status).toBe(expected);
  };
  await staffStep('Assign to me', 'assigned');
  await staffStep('Mark resolved', 'resolved', 'Washer replaced');
  const residentStep = async (button: string, expected: string, note?: string) => {
    await residentServices(customerPage);
    await customerPage.getByRole('button', { name: /Leaking tap/ }).click();
    if (note) await customerPage.getByLabel('Why it is not fixed').fill(note);
    await customerPage.getByRole('button', { name: button }).click();
    await expect.poll(status).toBe(expected);
  };
  await residentStep('Reopen complaint', 'reopened', 'Still dripping');
  await staffStep('Mark resolved', 'resolved', 'Tap replaced');
  await residentStep('Confirm it is fixed', 'closed');
  const [row] = await db.select().from(complaints).where(eq(complaints.stayId, stay.id));
  expect(row).toMatchObject({ status: 'closed', reopenCount: 1 });
  const events = await db
    .select()
    .from(complaintEvents)
    .where(eq(complaintEvents.complaintId, row?.id ?? ''))
    .orderBy(asc(complaintEvents.id));
  expect(events.map((event) => event.toStatus)).toEqual([
    'open',
    'assigned',
    'resolved',
    'reopened',
    'resolved',
    'closed',
  ]);
  await checkout(owner, stack.origin, data.branchId, stay.id, db);
  await customer.close();
});
test('Journey 6 / SERV-002: staff add a priced route; resident joins at that price; billing starts; resident leaves', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, owner, customer, customerPage } = await admitResident(
    page,
    browser,
    stack,
    { transportFees: true },
  );
  await staffServices(page, data.branchId);
  await page.getByLabel('Route name').fill('F-6 Shuttle');
  await page.getByLabel('Monthly charge (PKR)').fill('3100');
  await page.getByLabel('Departure times (HH:MM, comma separated)').fill('07:30, 17:00');
  await page.getByLabel('Stops (comma separated)').fill('F-6 Markaz, NUST Gate 1');
  await page.getByRole('button', { name: 'Add route' }).click();
  await expect(page.getByText(/F-6 Shuttle \(active\) · PKR 3,100\/month/)).toBeVisible();
  await residentServices(customerPage);
  await expect(
    customerPage.getByText(/PKR 3,100 per month, billed separately from rent/),
  ).toBeVisible();
  await customerPage.getByRole('button', { name: 'Request F-6 Shuttle' }).click();
  await expect(customerPage.getByText(/F-6 Shuttle: Requested/)).toBeVisible();
  await staffServices(page, data.branchId);
  await page.getByLabel('Transport effective date').fill(today());
  await page.getByRole('button', { name: 'Approve transport from date' }).click();
  await expect(page.getByRole('button', { name: 'End transport on date' })).toBeVisible();
  const transport = await db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.stayId, stay.id));
  expect(transport.find((row) => row.item === 'transport')?.state).toBe('active');
  await residentServices(customerPage);
  await customerPage.getByRole('button', { name: 'Ask to stop transport' }).click();
  await expect(customerPage.getByText(/end requested/)).toBeVisible();
  const end = new Date(Date.parse(today() + 'T00:00:00Z') + 20 * 86400000)
    .toISOString()
    .slice(0, 10);
  await staffServices(page, data.branchId);
  await page.getByLabel('Transport effective date').fill(end);
  await page.getByRole('button', { name: 'End transport on date' }).click();
  await expect(page.getByText(/F-6 Shuttle: Ended/)).toBeVisible();
  const [subscription] = await db
    .select()
    .from(transportSubscriptions)
    .where(eq(transportSubscriptions.stayId, stay.id));
  expect(subscription).toMatchObject({
    status: 'ended',
    effectiveFrom: today(),
    effectiveTo: end,
    monthlyChargePaisa: 310000n,
  });
  await checkout(owner, stack.origin, data.branchId, stay.id, db);
  await customer.close();
});
test('Journey 7 / REV-001..006: too-early gate; Verified Stay review shown publicly with the hostel reply', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, owner, customer, customerPage } = await admitResident(
    page,
    browser,
    stack,
  );
  await residentServices(customerPage);
  await expect(
    customerPage.getByText(
      /You can review this hostel from \d{4}-\d{2}-\d{2} \(after 30 days of stay\)/,
    ),
  ).toBeVisible();
  // A real 30-day Stay cannot exist on the live clock; creation and the boundary are proven in
  // the clock-controlled PostgreSQL suite. Here a review row stands in for an eligible Stay.
  const reviewId = randomUUID();
  await db.insert(reviews).values({
    id: reviewId,
    branchId: data.branchId,
    stayId: stay.id,
    userId: data.customerId,
    body: 'Clean rooms, friendly staff',
    status: 'published',
    version: 1,
  });
  await db
    .insert(reviewRatings)
    .values(
      [
        'cleanliness',
        'security',
        'food',
        'staff',
        'wifi',
        'facilities',
        'location',
        'value',
        'overall',
      ].map((category) => ({ reviewId, category: category as 'overall', rating: 4 })),
    );
  await staffServices(page, data.branchId);
  await page.getByLabel(/Reply to /).fill('Thank you for staying with us.');
  await page.getByRole('button', { name: 'Post public reply' }).click();
  await expect(page.getByRole('button', { name: 'Update public reply' })).toBeVisible();
  await page.goto(`/hostels/${data.branchId}`).catch(() => undefined);
  const listing = await page.request.get(`/api/v1/public/branches/${data.branchId}/reviews`);
  const body = (await listing.json()) as {
    data: { verifiedStay: boolean; reviewerName: string; reply: { body: string } | null }[];
  };
  expect(body.data[0]).toMatchObject({
    verifiedStay: true,
    reply: { body: 'Thank you for staying with us.' },
  });
  expect(JSON.stringify(body)).not.toMatch(/stayId|userId|seat|cnic/i);
  await checkout(owner, stack.origin, data.branchId, stay.id, db);
  await customer.close();
});
