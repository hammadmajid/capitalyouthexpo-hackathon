import { randomInt, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { eq, and } from 'drizzle-orm';
import {
  cities,
  areas,
  brands,
  branches,
  organizations,
  managerAssignments,
  type Database,
} from '@hsm/db';
import { expect } from './fixture';

async function openSavedHostel(page: Page) {
  await page
    .getByRole('region', { name: 'My organizations', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('region', { name: 'My hostels', exact: true })
    .getByRole('button', { name: 'Private browser hostel', exact: true })
    .click();
  await expect(page.getByLabel('Complete branch address', { exact: true })).toBeVisible();
}
/** ONB-001/AUTH-M-001: real browser controls, API, persisted drafts and invitation. */
export async function ownerSetupAcceptance(page: Page, db: Database, ownerId: string) {
  const cityId = randomUUID(),
    areaId = randomUUID();
  await db.insert(cities).values({ id: cityId, name: 'Onboarding city', slug: cityId });
  await db
    .insert(areas)
    .values({ id: areaId, cityId, name: 'Onboarding area', slug: areaId, level: 'sector' });
  await page
    .getByRole('region', { name: 'My organizations', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page.getByLabel('Hostel name', { exact: true }).fill('Private browser hostel');
  await page.getByLabel('Hostel category', { exact: true }).selectOption('boys');
  await page.getByRole('button', { name: 'Create private hostel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save main branch', exact: true })).toBeVisible();
  await expect(page.getByText(/You can manage your own branch/)).toBeVisible();
  await page.getByRole('button', { name: 'Onboarding city', exact: true }).click();
  await page.getByRole('button', { name: 'Onboarding area', exact: true }).click();
  await page
    .getByLabel('Complete branch address', { exact: true })
    .fill('Private browser main branch address');
  await page.getByLabel('Latitude', { exact: true }).fill('33.7');
  await page.getByLabel('Longitude', { exact: true }).fill('73.04');
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const canvas = page.getByRole('region', { name: 'Branch location map' }).locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Map ready.', { exact: true })).toBeVisible();
  await canvas.click({ position: { x: 80, y: 80 } });
  await page.getByRole('button', { name: 'Use selected pin', exact: true }).click();
  const selectedLatitude = await page.getByLabel('Latitude', { exact: true }).inputValue();
  const selectedLongitude = await page.getByLabel('Longitude', { exact: true }).inputValue();
  expect(Number.isFinite(Number(selectedLatitude))).toBe(true);
  expect(Number.isFinite(Number(selectedLongitude))).toBe(true);
  expect(selectedLatitude).not.toBe('33.7');
  await expect(page.getByLabel('Complete branch address', { exact: true })).toHaveValue(
    'Private browser main branch address',
  );
  await page.getByRole('button', { name: 'Save main branch', exact: true }).click();
  await expect(page.getByText('Main branch saved.', { exact: true })).toBeVisible();
  await page.reload();
  await openSavedHostel(page);
  await expect(page.getByLabel('Complete branch address', { exact: true })).toHaveValue(
    'Private browser main branch address',
  );
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue(selectedLatitude);
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue(selectedLongitude);
  const [saved] = await db
    .select({
      id: branches.id,
      cityId: branches.cityId,
      areaId: branches.areaId,
      status: branches.verificationStatus,
    })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, brands.organizationId))
    .where(and(eq(organizations.ownerUserId, ownerId), eq(brands.name, 'Private browser hostel')));
  expect(saved).toMatchObject({ cityId, areaId, status: 'draft' });
  if (!saved) throw new Error('Owner branch fixture missing');
  await page.getByRole('button', { name: 'Submit for verification', exact: true }).click();
  await expect(page.getByText('Status: submitted', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Complete branch address', { exact: true })).toHaveCount(0);
  const [submitted] = await db
    .select({ status: branches.verificationStatus, approvedAt: branches.firstApprovedAt })
    .from(branches)
    .where(eq(branches.id, saved.id));
  expect(submitted).toEqual({ status: 'submitted', approvedAt: null });
  await page.getByRole('button', { name: 'Invite a Manager', exact: true }).click();
  await page.getByLabel('Manager full name', { exact: true }).fill('Browser invited Manager');
  await page
    .getByLabel('Manager mobile number', { exact: true })
    .fill('+923' + randomInt(0, 1000000000).toString().padStart(9, '0'));
  await page.getByRole('button', { name: 'Send Manager invitation', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Hide temporary password', exact: true }),
  ).toBeVisible();
  const [invitation] = await db
    .select({ status: managerAssignments.status, hash: managerAssignments.tempPasswordHash })
    .from(managerAssignments)
    .where(eq(managerAssignments.branchId, saved.id));
  expect(invitation?.status).toBe('pending_activation');
  expect(Boolean(invitation?.hash)).toBe(true);
  await page.getByRole('button', { name: 'Hide temporary password', exact: true }).click();
  await expect(page.getByText(/^Temporary password:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset a pending invitation', exact: true }).click();
  await page.getByRole('button', { name: 'Browser invited Manager', exact: true }).click();
  await page.getByRole('button', { name: 'Replace temporary credential', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Hide replacement password', exact: true }),
  ).toBeVisible();
  const [replacement] = await db
    .select({ status: managerAssignments.status, hash: managerAssignments.tempPasswordHash })
    .from(managerAssignments)
    .where(eq(managerAssignments.branchId, saved.id));
  expect(replacement?.status).toBe('pending_activation');
  expect(Boolean(replacement?.hash)).toBe(true);
  expect(replacement?.hash).not.toBe(invitation?.hash);
  await page.getByRole('button', { name: 'Hide replacement password', exact: true }).click();
  await expect(page.getByText(/^Replacement temporary password:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close invitation recovery', exact: true }).click();
}
