import { and, eq, isNull } from 'drizzle-orm';
import { bookings, bookingHolds, inventoryClaims, users } from '@hsm/db';
import { bookingPageSchema, listingDetailsSchema } from '@hsm/contracts';
import { test, expect } from './fixture';
import { checkoutData } from './checkout-data';
test('BKG-001/002/004 / ACC-001/002: real browser guest return, hold, booking snapshot and public privacy', async ({
  page,
  context,
  stack,
  browser,
}) => {
  const data = await checkoutData(stack.database.db, stack.storage.env.S3_PRIVATE_BUCKET),
    path = '/hostels/' + data.branchId;
  async function quote() {
    await page.getByRole('button', { name: 'Quote room 501, bed A', exact: true }).click();
    await page.getByLabel('Move-in date', { exact: true }).fill(data.moveInDate);
    await page.getByLabel('Move-out date', { exact: true }).fill(data.moveOutDate);
    await page.getByRole('button', { name: 'Check availability and terms', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Current booking terms', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Monthly rent: PKR 18,000', { exact: true })).toBeVisible();
  }
  await page.goto(path);
  await quote();
  await page.getByRole('link', { name: 'Sign in to book this hostel', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/login?returnTo=' + encodeURIComponent(path));
  await page.getByLabel('Email or mobile number', { exact: true }).fill(data.email);
  await page.getByLabel('Password', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + path);
  await quote();
  await expect(page.getByLabel('Private CNIC number', { exact: true })).toHaveCount(0);
  const address = 'House 42, Street 9, Islamabad browser private fixture';
  await page.getByLabel('Private permanent address', { exact: true }).fill(address);
  await page
    .getByRole('checkbox', {
      name: 'I agree to the booking terms and to share required documents privately with this hostel Owner.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Temporarily hold this inventory', exact: true }).click();
  await expect(page.getByText(/Temporary hold expiry:/)).toBeVisible();
  const held = await stack.database.db
    .select()
    .from(bookingHolds)
    .where(
      and(
        eq(bookingHolds.customerUserId, data.customerId),
        eq(bookingHolds.branchId, data.branchId),
        isNull(bookingHolds.releasedAt),
      ),
    );
  expect(held).toHaveLength(1);
  const hold = held[0];
  if (!hold) throw new Error('Persisted hold missing');
  await page.getByRole('button', { name: 'Send booking request', exact: true }).click();
  await expect(page.getByText('Booking request sent', { exact: true })).toBeVisible();
  const rows = await stack.database.db
    .select()
    .from(bookings)
    .where(eq(bookings.customerUserId, data.customerId));
  expect(rows).toHaveLength(1);
  const booking = rows[0];
  if (!booking) throw new Error('Persisted booking missing');
  expect(booking).toMatchObject({
    branchId: data.branchId,
    roomId: data.roomId,
    seatId: data.seatId,
    state: 'pending_request',
  });
  const reference = 'HSM-' + booking.id.replaceAll('-', '').toUpperCase();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  const claims = await stack.database.db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt)));
  expect(claims).toHaveLength(1);
  expect(claims[0]).toMatchObject({ roomId: data.roomId, seatId: data.seatId });
  const [consumedHold] = await stack.database.db
    .select()
    .from(bookingHolds)
    .where(eq(bookingHolds.id, hold.id));
  expect(consumedHold?.releasedAt).toBeInstanceOf(Date);
  const [customer] = await stack.database.db
    .select({ permanentAddress: users.permanentAddress })
    .from(users)
    .where(eq(users.id, data.customerId));
  expect(customer?.permanentAddress).toBe(address);
  const response = await context.request.get('/api/v1/me/bookings?limit=20');
  expect(response.status()).toBe(200);
  const own = bookingPageSchema.parse(await response.json());
  expect(own.data).toHaveLength(1);
  expect(own.data[0]).toMatchObject({
    reference,
    state: 'pending_request',
    quote: {
      target: { kind: 'bed', roomId: data.roomId, bedId: data.seatId },
      range: { moveInDate: data.moveInDate, moveOutDate: data.moveOutDate },
      price: { monthlyRentPaisa: 1800000, depositPaisa: 0, fees: [] },
    },
  });
  await page.getByRole('link', { name: 'View your bookings', exact: true }).click();
  await expect(page.getByText('Reference: ' + reference, { exact: true })).toBeVisible();
  const publicReader = await browser.newContext({ baseURL: stack.origin });
  try {
    const publicResult = await publicReader.request.get('/api/v1/marketplace/' + data.branchId);
    expect(publicResult.status()).toBe(200);
    const publicListing = listingDetailsSchema.parse(await publicResult.json());
    const text = JSON.stringify(publicListing);
    for (const privateValue of [data.customerId, data.email, address, reference])
      expect(text).not.toContain(privateValue);
    expect((await publicReader.request.get('/api/v1/me/bookings')).status()).toBe(401);
  } finally {
    await publicReader.close();
  }
});
