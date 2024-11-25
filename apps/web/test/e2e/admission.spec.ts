import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import type { BrowserContext, Page } from '@playwright/test';
import {
  billingPolicies,
  bookings,
  inventoryClaims,
  residentInvoices,
  rooms,
  seats,
  stays,
  users,
} from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { test, expect } from './fixture';
import { checkoutData } from './checkout-data';
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email or mobile number', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function command(context: BrowserContext, origin: string, url: string, data: unknown) {
  const csrf = (await context.cookies()).find((cookie) => cookie.name === 'hsm_csrf')?.value;
  if (!csrf) throw new Error('CSRF binding missing');
  const response = await context.request.post(url, {
    data,
    headers: {
      origin,
      'x-csrf-token': decodeURIComponent(csrf),
      'Idempotency-Key': randomUUID(),
    },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return (await response.json()) as unknown;
}
test('STAY-001 / RES-001 / ACC-001: real browser booking check-in and walk-in admission', async ({
  page,
  browser,
  stack,
}) => {
  const db = stack.database.db,
    data = await checkoutData(db, stack.storage.env.S3_PRIVATE_BUCKET),
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    ownerEmail = randomUUID() + '@example.test',
    ownerPassword = 'Owner admission fixture phrase';
  const owner = { id: data.ownerId };
  await db
    .update(users)
    .set({
      email: ownerEmail,
      emailVerifiedAt: new Date(),
      passwordHash: await hash(ownerPassword, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    })
    .where(eq(users.id, owner.id));
  await db.insert(billingPolicies).values({
    id: randomUUID(),
    branchId: data.branchId,
    policy,
    isCurrent: true,
    createdByUserId: owner.id,
  });
  const walkInSeat = randomUUID(),
    walkInRoom = randomUUID();
  const [room] = await db
    .select({ roomTypeId: rooms.roomTypeId })
    .from(rooms)
    .where(eq(rooms.id, data.roomId));
  await db.insert(rooms).values({
    id: walkInRoom,
    branchId: data.branchId,
    roomTypeId: room?.roomTypeId ?? '',
    label: '502',
    status: 'active',
  });
  await db.insert(seats).values({
    id: walkInSeat,
    branchId: data.branchId,
    roomId: walkInRoom,
    ordinal: 1,
    label: 'B',
    status: 'active',
  });
  // Customer requests a bed starting today through the real API proxy.
  const customer = await browser.newContext({ baseURL: stack.origin });
  let bookingId: string;
  try {
    const customerPage = await customer.newPage();
    await signIn(customerPage, data.email, data.password);
    await expect(customerPage).toHaveURL(new RegExp('/app|/hostels|/$'));
    const quote = bookingQuoteSnapshotSchema.parse(
      await command(customer, stack.origin, `/api/v1/marketplace/${data.branchId}/quote`, {
        target: { kind: 'bed', roomId: data.roomId, bedId: data.seatId },
        range: { moveInDate: today, moveOutDate: data.moveOutDate },
      }),
    );
    const booking = bookingSummarySchema.parse(
      await command(customer, stack.origin, `/api/v1/marketplace/${data.branchId}/bookings`, {
        quote,
        documents: [],
        permanentAddress: 'House 7, Street 3, Rawalpindi admission fixture',
      }),
    );
    bookingId = booking.id;
  } finally {
    await customer.close();
  }
  await signIn(page, ownerEmail, ownerPassword);
  await expect(page).toHaveURL(stack.origin + '/app');
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(data.branchId);
  const reference = 'HSM-' + bookingId.replaceAll('-', '').toUpperCase();
  const card = page.locator('li, article, section').filter({ hasText: reference }).last();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Confirm request' }).click();
  await card.getByLabel('Reason for confirmation').fill('Reviewed for admission');
  await card.getByRole('button', { name: 'Submit confirmation' }).click();
  await expect(card.getByText('Status: confirmed')).toBeVisible();
  // Path B: confirmed booking → active Stay with exactly the captured terms.
  await card.getByRole('button', { name: 'Check in resident' }).click();
  await expect(card.getByText('Agreed monthly rent: PKR 18,000')).toBeVisible();
  await card.getByRole('button', { name: 'Confirm check-in' }).click();
  // The refreshed booking list replaces the action with its linked Stay.
  await expect(card.getByText(/^Checked in\. Stay active: /)).toBeVisible();
  const [stay] = await db.select().from(stays).where(eq(stays.bookingId, bookingId));
  expect(stay).toMatchObject({ source: 'booking', state: 'active' });
  await page.reload();
  await page.getByRole('combobox', { name: 'Your branch' }).selectOption(data.branchId);
  const checked = page.locator('li, article, section').filter({ hasText: reference }).last();
  await expect(checked.getByText('Checked in. Stay active: ' + (stay?.id ?? ''))).toBeVisible();
  await expect(checked.getByRole('button', { name: 'Check in resident' })).toHaveCount(0);
  // Path A: walk-in admission into the remaining bed.
  await page.getByRole('button', { name: 'Admit resident', exact: true }).click();
  const admission = page.getByRole('region', { name: 'Resident admission' });
  await expect(admission).toBeVisible();
  await admission.getByRole('button', { name: 'New offline resident' }).click();
  await admission.getByLabel('Resident name', { exact: true }).fill('Walk In Browser');
  await admission.getByRole('button', { name: 'Continue with offline resident' }).click();
  await admission
    .getByRole('combobox', { name: 'Admission room', exact: true })
    .selectOption({ label: '502' });
  await admission
    .getByRole('combobox', { name: 'Admission target type' })
    .selectOption({ label: 'Individual bed' });
  await admission
    .getByRole('combobox', { name: 'Admission bed', exact: true })
    .selectOption({ label: 'B' });
  await admission.getByRole('button', { name: 'Continue with selected target' }).click();
  await admission.getByLabel('Agreed move-in date', { exact: true }).fill(today);
  await admission.getByLabel('Explicitly agree an open-ended Stay', { exact: true }).check();
  await admission.getByLabel('Agreed rent per billing period (PKR)', { exact: true }).fill('18000');
  await admission.getByLabel('Agreed deposit (PKR)', { exact: true }).fill('0');
  await admission.getByRole('button', { name: 'Review agreed terms' }).click();
  await admission.getByLabel('Rent billing starts', { exact: true }).fill(today);
  await admission.getByRole('button', { name: 'Review admission' }).click();
  await admission
    .getByLabel('I confirm the agreed terms and that the resident is being admitted now.')
    .check();
  await admission.getByRole('button', { name: 'Admit resident' }).click();
  await expect(admission.getByRole('heading', { name: 'Resident admitted' })).toBeVisible();
  // BED-001: the Bed Board reads both admissions back from authoritative occupancy.
  await page.getByRole('button', { name: 'View Bed Board' }).click();
  const board = page.getByRole('region', { name: 'Bed Board' });
  await expect(board.getByText('Bed A: Occupied — Browser booking Customer')).toBeVisible();
  await expect(board.getByText('Bed B: Occupied — Walk In Browser')).toBeVisible();
  // BED-002 / STAY-002: an occupied bed opens its Stay record with the original agreement.
  await board.getByRole('button', { name: 'Details for room 501 bed A' }).click();
  const bedDetail = page.getByRole('region', { name: 'Bed details' });
  await expect(bedDetail.getByText(/Resident assignment \(occupancy\)/)).toBeVisible();
  await expect(bedDetail.getByText('Agreed rent: PKR 18,000 per billing period')).toBeVisible();
  await expect(bedDetail.getByText(/from confirmed booking/)).toBeVisible();
  // RES-004: one row per resident; the walk-in is an offline relationship.
  await page.getByRole('button', { name: 'View residents' }).click();
  const residentsRegion = page.getByRole('region', { name: 'Residents' });
  await expect(
    residentsRegion.getByText('Browser booking Customer', { exact: true }),
  ).toBeVisible();
  await residentsRegion.getByRole('button', { name: 'View profile for Walk In Browser' }).click();
  await expect(page.getByText('Offline resident (no linked account)')).toBeVisible();
  // RB-001..004: the Rent Board shows the check-in's first invoice for its billing month.
  const [firstInvoice] = await db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, stay?.id ?? ''));
  if (!firstInvoice) throw new Error('First invoice missing');
  await page.getByRole('button', { name: 'View Rent Board' }).click();
  const rent = page.getByRole('region', { name: 'Rent Board' });
  await rent.getByLabel('Billing month').fill(firstInvoice.dueDate.slice(0, 7));
  await expect(rent.getByText('Browser booking Customer · Room 501, Bed A')).toBeVisible();
  await expect(rent.getByText(new RegExp('^' + firstInvoice.number + ': due '))).toBeVisible();
  await expect(
    rent.getByText(/^Status: (Issued \(not yet overdue\)|Overdue)$/).first(),
  ).toBeVisible();
  // CHG-012: the resident reads only their own Stay record.
  const resident = await browser.newContext({ baseURL: stack.origin });
  try {
    const own = await resident.newPage();
    await signIn(own, data.email, data.password);
    await own.getByRole('button', { name: 'My stays' }).click();
    await own.getByRole('button', { name: 'View stay for Browser booking Customer' }).click();
    await expect(own.getByText('Hostel branch: Branch A')).toBeVisible();
    await expect(own.getByText(/Room 501 · Bed A/)).toBeVisible();
    const foreign = await resident.request.get('/api/v1/branches/' + data.branchId + '/rent-board');
    expect(foreign.status()).toBe(403);
  } finally {
    await resident.close();
  }
  const walkIns = await db
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, data.branchId), eq(stays.source, 'manual')));
  expect(walkIns).toHaveLength(1);
  const live = await db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.branchId, data.branchId), isNull(inventoryClaims.releasedAt)));
  expect(live.map((claim) => claim.seatId).sort()).toEqual([data.seatId, walkInSeat].sort());
  expect(live.every((claim) => claim.assignmentId !== null)).toBe(true);
  expect(await db.select().from(bookings).where(eq(bookings.id, bookingId))).toHaveLength(1);
});
