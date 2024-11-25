import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { and, eq } from 'drizzle-orm';
import { adminAccounts, cities, customerProfiles, places, platformAuditLog, users } from '@hsm/db';
import { test, expect } from './fixture';
import { signIn } from './payments-setup';
const password = 'Disposable governed admin journey 2026';
test('HMA-015/016: Root governs institution revisions and customer warnings through real Web forms', async ({
  page,
  stack,
}) => {
  const db = stack.database.db,
    root = randomUUID(),
    customer = randomUUID(),
    city = randomUUID();
  const email = root + '@example.test';
  await db.insert(users).values([
    {
      id: root,
      fullName: 'Disposable Governance Root',
      email,
      emailVerifiedAt: new Date(),
      passwordHash: await hash(password, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    },
    { id: customer, fullName: 'Disposable Governed Customer' },
  ]);
  await db.insert(adminAccounts).values({ userId: root, isRoot: true, status: 'active' });
  await db.insert(customerProfiles).values({ userId: customer });
  await db.insert(cities).values({ id: city, name: 'Disposable governance city', slug: city });
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/app/);
  const directory = page.getByRole('region', { name: 'Institution directory', exact: true });
  await directory.getByRole('button', { name: 'Create institution', exact: true }).click();
  await directory.getByLabel('Institution name', { exact: true }).fill('Governed University');
  await directory.getByLabel('Institution cityId', { exact: true }).fill(city);
  await directory.getByLabel('Institution latitude', { exact: true }).fill('33');
  await directory.getByLabel('Institution longitude', { exact: true }).fill('73');
  await directory
    .getByLabel('Institution change reason', { exact: true })
    .fill('Verified university location and identity');
  await directory
    .getByLabel('Accurate data approved for public discovery', { exact: true })
    .check();
  await directory.getByRole('button', { name: 'Review institution changes', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.select().from(places).where(eq(places.name, 'Governed University'))).length,
    )
    .toBe(0);
  await directory.getByRole('button', { name: 'Confirm institution changes', exact: true }).click();
  await expect(
    directory.getByRole('button', { name: 'Close institution editor', exact: true }),
  ).toHaveCount(0);
  await directory.getByRole('button', { name: 'Edit Governed University', exact: true }).click();
  await directory.getByLabel('Institution latitude', { exact: true }).fill('34');
  await directory
    .getByLabel('Institution aliases', { exact: true })
    .fill('Reviewed University Alias');
  await directory
    .getByLabel('Institution change reason', { exact: true })
    .fill('Reviewed and confirmed campus relocation');
  await directory
    .getByLabel('Explicitly reapprove identity, aliases and location', { exact: true })
    .check();
  await directory.getByRole('button', { name: 'Review institution changes', exact: true }).click();
  await directory.getByRole('button', { name: 'Confirm institution changes', exact: true }).click();
  await expect(
    directory.getByRole('button', { name: 'Close institution editor', exact: true }),
  ).toHaveCount(0);
  await directory.getByRole('button', { name: 'Edit Governed University', exact: true }).click();
  const history = directory.getByRole('region', { name: 'Institution revision history' });
  await expect(history.getByText(/Reviewed and confirmed campus relocation/)).toBeVisible();
  await expect(history.getByText('latitude', { exact: true }).first()).toBeVisible();
  await directory.getByRole('button', { name: 'Close institution editor', exact: true }).click();
  const governance = page.getByRole('region', { name: 'Customer account governance', exact: true });
  await governance
    .getByLabel('Decision reason for Disposable Governed Customer')
    .fill('Confirmed repeated harassment after review');
  await governance.getByRole('button', { name: 'warn customer', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .select()
            .from(platformAuditLog)
            .where(
              and(
                eq(platformAuditLog.targetId, customer),
                eq(platformAuditLog.action, 'customer.warn'),
              ),
            )
        ).length,
    )
    .toBe(0);
  await governance.getByRole('button', { name: 'Confirm customer decision', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .select()
            .from(platformAuditLog)
            .where(
              and(
                eq(platformAuditLog.targetId, customer),
                eq(platformAuditLog.action, 'customer.warn'),
              ),
            )
        ).length,
    )
    .toBe(1);
  await expect(governance.getByText('Disposable Governance Root', { exact: true })).toHaveCount(0);
});
