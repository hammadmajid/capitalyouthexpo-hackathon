import type { Page } from '@playwright/test';
import { expect } from './fixture';
// RPT-001 / PROP / AUD-010: actual controls and cookies, using Journey 8's
// disposable account/branch. Preserve the approved scenario title/catalog.
export async function reportFilterChecks(page: Page, branchId: string) {
  await page.getByLabel('Your branch', { exact: true }).selectOption(branchId);
  await page.getByRole('button', { name: 'Manage buildings and floors' }).click();
  const property = page.getByRole('region', { name: 'Property metadata' });
  await property.getByRole('button', { name: 'Add building', exact: true }).click();
  await property.getByLabel('Building name', { exact: true }).fill('Journey report block');
  await property.getByRole('button', { name: 'Save property metadata' }).click();
  await expect(property.getByText('Property metadata saved.')).toBeVisible();
  await property.getByLabel('Property building').selectOption({ label: 'Journey report block' });
  await property.getByRole('button', { name: 'Add floor', exact: true }).click();
  await property.getByLabel('Floor label', { exact: true }).fill('Journey ground');
  await property.getByRole('button', { name: 'Save property metadata' }).click();
  await expect(property.getByLabel('Floor label', { exact: true })).toHaveCount(0);
  await property.getByRole('button', { name: 'Close property metadata' }).click();
  await page.getByRole('button', { name: 'Room 501 location', exact: true }).click();
  const location = page.getByRole('region', { name: 'Room 501 location', exact: true });
  await location.getByLabel('Property building').selectOption({ label: 'Journey report block' });
  await location.getByLabel('Property floor').selectOption({ label: 'Journey ground · Level 0' });
  await location.getByLabel('Room location reason').fill('Synthetic actual-room classification');
  await location.getByRole('button', { name: 'Assign selected floor' }).click();
  await expect(location.getByText('Room location saved and refreshed.')).toBeVisible();
  await location.getByRole('button', { name: 'Close room location' }).click();
  const dashboard = page.getByRole('region', { name: 'Owner dashboard' });
  const reports = dashboard.getByRole('region', { name: 'Reports', exact: true });
  await reports.getByRole('button', { name: 'Filter reports', exact: true }).click();
  await reports.getByLabel('Report type', { exact: true }).selectOption('residents');
  await reports
    .getByLabel('Report building', { exact: true })
    .selectOption({ label: 'Journey report block' });
  await reports
    .getByLabel('Report floor', { exact: true })
    .selectOption({ label: 'Journey ground' });
  await reports
    .getByLabel('Report room', { exact: true })
    .selectOption({ label: '501 · Journey report block / Journey ground' });
  await reports
    .getByLabel('Report resident', { exact: true })
    .selectOption({ label: 'Browser booking Customer' });
  await reports.getByLabel('Report status', { exact: true }).selectOption('active');
  const link = reports.getByRole('link', { name: 'CSV', exact: true });
  await expect(link).toBeVisible();
  const path = await link.getAttribute('href');
  if (!path) throw new Error('Filtered report path missing');
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()['x-hsm-report-truncated']).toBe('false');
  expect(await response.text()).toContain('"Browser booking Customer"');
  const downloading = page.waitForEvent('download');
  await link.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^hsm-residents-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await download.failure()).toBeNull();
}
