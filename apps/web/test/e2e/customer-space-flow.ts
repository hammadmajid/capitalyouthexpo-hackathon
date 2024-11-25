import { randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { bookingPageSchema, listingPageSchema } from '@hsm/contracts';
// ACC-002/004 / SEC-003: use the production browser/API fixture; no route mocks.
export async function customerSpaceAcceptance(page: Page, context: BrowserContext, origin: string) {
  await expect(page.getByRole('heading', { name: 'My bookings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved hostels', exact: true })).toBeVisible();
  await expect(page.getByText('You have no bookings yet.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No approved Saved hostels are available.', { exact: true }),
  ).toBeVisible();
  const bookings = await context.request.get('/api/v1/me/bookings?limit=20');
  const saved = await context.request.get('/api/v1/me/favorites?limit=20');
  expect(bookings.status()).toBe(200);
  expect(saved.status()).toBe(200);
  expect(bookingPageSchema.parse(await bookings.json())).toEqual({ data: [], nextCursor: null });
  expect(listingPageSchema.parse(await saved.json())).toEqual({ data: [], nextCursor: null });
  const rejected = await context.request.put('/api/v1/me/favorites/' + randomUUID(), {
    headers: { origin, 'Idempotency-Key': randomUUID() },
    data: { saved: true },
  });
  expect(rejected.status()).toBe(403);
}
