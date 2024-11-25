import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { branches, type Database } from '@hsm/db';
import type { Page } from '@playwright/test';
import { expect } from './fixture';
import { dashboardQueuePath } from '../../src/lib/dashboard-queue-path';
export async function dashboardQueueChecks(
  page: Page,
  db: Database,
  branchId: string,
  invoiceNumber: string,
  dueDate: string,
) {
  await page.goto(dashboardQueuePath('owner', 'overdue', branchId));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  if (dueDate < today) {
    await page.getByRole('button', { name: 'View overdue invoice ' + invoiceNumber }).click();
    await expect(page.getByText('Financial status: Overdue', { exact: true })).toBeVisible();
  } else await expect(page.getByText('No items are waiting in this queue.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overdue invoices', exact: true })).toBeVisible();
  await page.goto(dashboardQueuePath('owner', 'proofs', branchId));
  await expect(page.getByText('No proofs are waiting.')).toBeVisible();
  await page.goto(dashboardQueuePath('owner', 'bookings', branchId));
  await expect(page.getByText('No bookings are available for this branch.')).toBeVisible();
  const [base] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!base) throw new Error('Missing queue paging branch');
  await db.insert(branches).values(
    Array.from({ length: 100 }, (_, index) => {
      const id = `ffffffff-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return {
        id,
        organizationId: base.organizationId,
        brandId: base.brandId,
        cityId: base.cityId,
        areaId: base.areaId,
        name: 'Queue browser ' + String(index + 1).padStart(3, '0'),
        slug: randomUUID(),
        category: 'boys' as const,
        addressLine: 'Browser queue paging fixture',
        location: 'SRID=4326;POINT(73 33)',
      };
    }),
  );
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Next dashboard branches' }).click();
  await expect(
    page.getByRole('table', { name: 'Branches' }).getByText('Queue browser 100'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'First dashboard branches' }).click();
  const link = page.getByRole('link', { name: /^Overdue invoices:/ });
  await link.focus();
  await link.press('Enter');
  await expect(page).toHaveURL(new RegExp('/app/owner/queues/overdue$'));
  for (let index = 0; index < 5; index++)
    await page.getByRole('button', { name: 'Next queue branches' }).click();
  await page.getByRole('link', { name: 'Queue browser 100', exact: true }).click();
  await expect(page.getByText('No items are waiting in this queue.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No items are waiting in this queue.')).toBeVisible();
}
