import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { eq } from 'drizzle-orm';
import type { Browser } from '@playwright/test';
import {
  adminAccounts,
  adminRoleGrants,
  customerProfiles,
  managerAssignments,
  managerInventoryGrants,
  platformAuditLog,
  reviewRatings,
  reviews,
  stays,
  users,
  type Database,
} from '@hsm/db';
import { test, expect } from './fixture';
import { admitResident, command, signIn } from './payments-setup';
import { reportFilterChecks } from './report-filter-checks';
import { dashboardQueueChecks } from './dashboard-queue-checks';
import { dashboardQueuePath } from '../../src/lib/dashboard-queue-path';
const password = 'Platform journey phrase 2026';
async function account(db: Database, name: string, kind: 'customer' | 'plain') {
  const id = randomUUID(),
    email = id + '@example.test';
  await db.insert(users).values({
    id,
    fullName: name,
    email,
    emailVerifiedAt: new Date(),
    passwordHash: await hash(password, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  });
  if (kind === 'customer')
    await db
      .insert(customerProfiles)
      .values({ userId: id, age: 21, profileCompletedAt: new Date() });
  return { id, email };
}
async function session(browser: Browser, origin: string, email: string) {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await signIn(page, email, password);
  await expect(page).toHaveURL(new RegExp('/app'));
  return { context, page };
}
async function close(
  db: Database,
  owner: Parameters<typeof command>[0],
  origin: string,
  branchId: string,
  stayId: string,
) {
  const [row] = await db.select({ version: stays.version }).from(stays).where(eq(stays.id, stayId));
  await command(owner, origin, `/api/v1/branches/${branchId}/stays/${stayId}/checkout`, {
    expectedVersion: row?.version,
    reason: 'Moved out',
    applyAvailableDeposit: false,
  });
}
test('Journey 8 / OWN-001..004: owner sees authoritative totals, drills into a branch and downloads a report', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, owner, customer, invoice } = await admitResident(page, browser, stack);
  await page.goto('/app');
  const dashboard = page.getByRole('region', { name: 'Owner dashboard' });
  await dashboard.getByLabel('Dashboard branch').selectOption(data.branchId);
  await expect(dashboard.getByText(/Active residents 1/)).toBeVisible();
  await expect(dashboard.getByText(/outstanding PKR 18,000/)).toBeVisible();
  await expect(dashboard.getByText('Not active yet (deferred)')).toBeVisible();
  // RPT-002 / AUD-007: exercise the actual authenticated link-to-blob download,
  // in addition to the original direct-response assertions below.
  const downloading = page.waitForEvent('download');
  await dashboard
    .getByRole('region', { name: 'Reports' })
    .getByRole('link', { name: 'CSV', exact: true })
    .first()
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^hsm-occupancy-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await download.failure()).toBeNull();
  const csv = await page.request.get(
    `/api/v1/owner/reports/residents?format=csv&branchIds=${data.branchId}`,
  );
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-disposition']).toContain('attachment');
  expect(csv.headers()['x-hsm-report-truncated']).toBe('false');
  expect(await csv.text()).toContain('"Browser booking Customer"');
  const pdf = await page.request.get(
    `/api/v1/owner/reports/rent-collection?format=pdf&branchIds=${data.branchId}`,
  );
  expect(pdf.headers()['x-hsm-report-truncated']).toBe('false');
  expect((await pdf.body()).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  await reportFilterChecks(page, data.branchId);
  await test.step('AUD-009 owner queue links and paging', async () =>
    dashboardQueueChecks(page, db, data.branchId, invoice.number, invoice.dueDate));
  await close(db, owner, stack.origin, data.branchId, stay.id);
  await customer.close();
});
test('Journey 9 / ADM-001..008: a moderator hides a reported review by policy; Root mutations are refused; audit kept', async ({
  page,
  browser,
  stack,
}) => {
  const { db, data, stay, owner, customer } = await admitResident(page, browser, stack);
  const root = await account(db, 'Root Journey', 'plain'),
    moderator = await account(db, 'Moderator Journey', 'plain');
  const [existingRoot] = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.isRoot, true));
  if (!existingRoot)
    await db.insert(adminAccounts).values({ userId: root.id, isRoot: true, status: 'active' });
  await db.insert(adminAccounts).values({ userId: moderator.id, status: 'active' });
  await db.insert(adminRoleGrants).values({
    adminUserId: moderator.id,
    role: 'content_moderator',
    grantedByUserId: existingRoot?.userId ?? root.id,
  });
  const reviewId = randomUUID();
  await db.insert(reviews).values({
    id: reviewId,
    branchId: data.branchId,
    stayId: stay.id,
    userId: data.customerId,
    body: 'Visit spam.example for cheap rooms',
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
      ].map((category) => ({ reviewId, category: category as 'overall', rating: 3 })),
    );
  await command(owner, stack.origin, `/api/v1/reviews/${reviewId}/reports`, {
    reason: 'spam',
    details: 'Advertising link',
  });
  const admin = await session(browser, stack.origin, moderator.email);
  await admin.page.goto('/app');
  const console = admin.page.getByRole('region', { name: 'Review moderation' });
  await expect(console.getByText(/Visit spam\.example/)).toBeVisible();
  await console.getByLabel('Policy reason').fill('Advertising link (spam policy)');
  await console.getByRole('button', { name: 'Hide review for policy reason' }).click();
  await expect
    .poll(
      async () =>
        (
          await db.select({ status: reviews.status }).from(reviews).where(eq(reviews.id, reviewId))
        )[0]?.status,
    )
    .toBe('hidden');
  const denied = await admin.context.request.post('/api/v1/admin/admins', {
    data: { email: 'x@example.test', roles: ['support'] },
    headers: {
      origin: stack.origin,
      'x-csrf-token': decodeURIComponent(
        (await admin.context.cookies()).find((c) => c.name === 'hsm_csrf')?.value ?? '',
      ),
      'Idempotency-Key': randomUUID(),
    },
  });
  expect(denied.status()).toBe(403);
  const audit = await db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, reviewId));
  expect(audit.map((row) => row.action)).toContain('review.hide');
  const listing = (await (
    await page.request.get(`/api/v1/public/branches/${data.branchId}/reviews`)
  ).json()) as { data: { id: string }[] };
  expect(listing.data.map((row) => row.id)).not.toContain(reviewId);
  await admin.context.close();
  await close(db, owner, stack.origin, data.branchId, stay.id);
  await customer.close();
});
test('Journey 10 / SEC-001 / ACC-002: a Branch A manager and another resident cannot reach Branch B or private records', async ({
  page,
  browser,
  stack,
}) => {
  const first = await admitResident(page, browser, stack);
  const managerUser = await account(first.db, 'Manager Journey', 'plain'),
    stranger = await account(first.db, 'Stranger Journey', 'customer');
  const assignmentId = randomUUID();
  await first.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: managerUser.id,
    branchId: first.data.branchId,
    status: 'active',
    appointedByUserId: first.data.ownerId,
    activatedAt: new Date(),
  });
  await first.db.insert(managerInventoryGrants).values(
    ['stay_manage', 'finance_view'].map((permission) => ({
      assignmentId,
      permission: permission as 'stay_manage',
      grantedAt: new Date(),
    })),
  );
  const complaint = await command(
    first.customer,
    stack.origin,
    `/api/v1/me/stays/${first.stay.id}/complaints`,
    { category: 'wifi', title: 'No Wi-Fi', description: 'Router down' },
  );
  const manager = await session(browser, stack.origin, managerUser.email);
  await manager.page.goto(dashboardQueuePath('manager', 'complaints', first.data.branchId));
  await expect(manager.page.getByRole('button', { name: 'Open complaint No Wi-Fi' })).toBeVisible();
  expect(
    (
      await manager.context.request.get(`/api/v1/branches/${first.data.branchId}/complaints`)
    ).status(),
  ).toBe(200);
  const other = (await first.db.select({ branchId: stays.branchId }).from(stays).limit(50))
    .map((row) => row.branchId)
    .find((id) => id !== first.data.branchId);
  const foreign = other ?? randomUUID();
  for (const queue of ['overdue', 'complaints', 'checkouts'] as const) {
    await manager.page.goto(dashboardQueuePath('manager', queue, foreign));
    await expect(manager.page.getByRole('alert')).toBeVisible();
    await expect(manager.page.getByText('Router down', { exact: true })).toHaveCount(0);
  }
  for (const path of ['complaints', 'dashboard', 'occupancy', 'reports/residents'])
    expect(
      (await manager.context.request.get(`/api/v1/branches/${foreign}/${path}`)).status(),
    ).toBe(403);
  expect((await manager.context.request.get('/api/v1/owner/dashboard')).status()).toBe(403);
  await first.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  await manager.page.goto(dashboardQueuePath('manager', 'complaints', first.data.branchId));
  await expect(manager.page.getByText('Queue access unavailable.', { exact: true })).toBeVisible();
  await expect(manager.page.getByRole('button', { name: 'Open complaint No Wi-Fi' })).toHaveCount(
    0,
  );
  const outsider = await session(browser, stack.origin, stranger.email);
  expect(
    (
      await outsider.context.request.get(
        `/api/v1/me/stays/${first.stay.id}/complaints/${complaint.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (await outsider.context.request.get(`/api/v1/me/stays/${first.stay.id}/settlement`)).status(),
  ).toBe(404);
  expect(
    (
      await outsider.context.request.get(`/api/v1/branches/${first.data.branchId}/rent-board`)
    ).status(),
  ).toBe(403);
  expect((await outsider.context.request.get('/api/v1/admin/support-tickets')).status()).toBe(403);
  await manager.context.close();
  await outsider.context.close();
  await close(first.db, first.owner, stack.origin, first.data.branchId, first.stay.id);
  await first.customer.close();
});
