import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { eq } from 'drizzle-orm';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { billingPolicies, residentInvoices, stays, users } from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { expect, type test } from './fixture';
import { checkoutData } from './checkout-data';
type Stack = Parameters<Parameters<typeof test>[2]>[0]['stack'];
// SERV-002: the approved monthly fee policy that paid transport needs (opt-in).
const feeBilling = {
  oneTimeDueOffsetDays: 0,
  monthly: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'calendar_days', rounding: 'half_up' },
  },
};
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
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email or mobile number', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
export async function command(context: BrowserContext, origin: string, url: string, data: unknown) {
  const csrf = (await context.cookies()).find((cookie) => cookie.name === 'hsm_csrf')?.value;
  if (!csrf) throw new Error('CSRF binding missing');
  const response = await context.request.post(url, {
    data,
    headers: { origin, 'x-csrf-token': decodeURIComponent(csrf), 'Idempotency-Key': randomUUID() },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return (await response.json()) as Record<string, unknown>;
}
async function prepareOwner(
  db: Stack['database']['db'],
  data: Awaited<ReturnType<typeof checkoutData>>,
  ownerEmail: string,
  ownerPassword: string,
  transportFees = false,
) {
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
    .where(eq(users.id, data.ownerId));
  const policyVersionId = randomUUID();
  await db.insert(billingPolicies).values({
    id: policyVersionId,
    branchId: data.branchId,
    policy: transportFees ? { ...policy, feeBilling } : policy,
    isCurrent: true,
    createdByUserId: data.ownerId,
  });
  return policyVersionId;
}
// STAY-001: a resident is booked today, confirmed, checked in and shown branch payment details.
export async function admitResident(
  page: Page,
  browser: Browser,
  stack: Stack,
  options: { moveOutDate?: string; transportFees?: boolean } = {},
) {
  const db = stack.database.db,
    data = await checkoutData(db, stack.storage.env.S3_PRIVATE_BUCKET),
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    ownerEmail = randomUUID() + '@example.test',
    ownerPassword = 'Owner payments fixture phrase';
  const policyVersionId = await prepareOwner(
    db,
    data,
    ownerEmail,
    ownerPassword,
    options.transportFees,
  );
  // Customer books today; the Owner confirms and checks in through the real API proxy.
  const customer = await browser.newContext({ baseURL: stack.origin });
  const customerPage = await customer.newPage();
  await signIn(customerPage, data.email, data.password);
  await expect(customerPage).toHaveURL(new RegExp('/app'));
  const quote = bookingQuoteSnapshotSchema.parse(
    await command(customer, stack.origin, `/api/v1/marketplace/${data.branchId}/quote`, {
      target: { kind: 'bed', roomId: data.roomId, bedId: data.seatId },
      range: { moveInDate: today, moveOutDate: options.moveOutDate ?? data.moveOutDate },
    }),
  );
  const booking = bookingSummarySchema.parse(
    await command(customer, stack.origin, `/api/v1/marketplace/${data.branchId}/bookings`, {
      quote,
      documents: [],
      permanentAddress: 'House 9, Street 4, Islamabad payments fixture',
    }),
  );
  const owner = page.context();
  await signIn(page, ownerEmail, ownerPassword);
  await expect(page).toHaveURL(stack.origin + '/app');
  await command(
    owner,
    stack.origin,
    `/api/v1/branches/${data.branchId}/bookings/${booking.id}/confirm`,
    {
      reason: 'Reviewed',
    },
  );
  await command(
    owner,
    stack.origin,
    `/api/v1/branches/${data.branchId}/stays/bookings/${booking.id}/check-in`,
    {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    },
  );
  await command(owner, stack.origin, `/api/v1/branches/${data.branchId}/payment-instructions`, {
    method: 'bank_transfer',
    accountTitle: 'Payments Fixture Hostel',
    accountIdentifier: 'PK00PAYMENTS',
    instructions: null,
  });
  const [stay] = await db.select().from(stays).where(eq(stays.bookingId, booking.id));
  const [invoice] = await db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, stay?.id ?? ''));
  if (!stay || !invoice) throw new Error('Stay or invoice missing');
  return { db, data, today, customer, customerPage, owner, stay, invoice };
}
