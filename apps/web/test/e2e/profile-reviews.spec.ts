import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  customerProfiles,
  profileReviewRequests,
  users,
} from '@hsm/db';
import { test, expect } from './fixture';
import { signIn } from './payments-setup';

test.skip(
  process.env.HSM_TEST_PROFILE_REVIEWS !== 'true',
  'Requires disposable profile-review opt-in',
);

test('HMA-015: private identity correction through real Web review forms', async ({
  page,
  stack,
}) => {
  const db = stack.database.db,
    root = randomUUID(),
    subject = randomUUID();
  const password = 'Disposable profile review browser phrase';
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.insert(users).values([
    {
      id: root,
      fullName: 'Disposable Review Root',
      email: root + '@example.test',
      emailVerifiedAt: new Date(),
      passwordHash,
    },
    {
      id: subject,
      fullName: 'Disposable Review Customer',
      email: subject + '@example.test',
      emailVerifiedAt: new Date(),
      passwordHash,
    },
  ]);
  await db.insert(adminAccounts).values({ userId: root, isRoot: true, status: 'active' });
  await db
    .insert(customerProfiles)
    .values({ userId: subject, age: 26, profileCompletedAt: new Date() });
  await signIn(page, subject + '@example.test', password);
  await expect(page).toHaveURL(/\/app/);
  await page
    .getByRole('button', { name: 'Profile correction and photo reviews', exact: true })
    .click();
  await page
    .getByLabel('Requested legal name', { exact: true })
    .fill('Corrected Disposable Customer');
  await page
    .getByLabel('Profile request reason', { exact: true })
    .fill('Correct the documented legal name');
  await page.getByLabel('Identity proof / CNIC front', { exact: true }).setInputFiles({
    name: 'identity.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nprivate browser identity document\n'),
  });
  await expect(page.getByText('File checked and ready.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review profile request', exact: true }).click();
  expect(
    await db.select().from(profileReviewRequests).where(eq(profileReviewRequests.userId, subject)),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm profile request', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .select()
            .from(profileReviewRequests)
            .where(eq(profileReviewRequests.userId, subject))
        ).length,
    )
    .toBe(1);
  const [review] = await db
    .select()
    .from(profileReviewRequests)
    .where(eq(profileReviewRequests.userId, subject));
  if (!review) throw new Error('Disposable review missing');
  await page.context().clearCookies();
  await signIn(page, root + '@example.test', password);
  await expect(page).toHaveURL(/\/app/);
  await page.getByRole('button', { name: 'Review case ' + review.id, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Profile review case', exact: true });
  await expect(panel.getByText('Corrected Disposable Customer', { exact: true })).toHaveCount(0);
  await panel
    .getByLabel('Profile review access purpose', { exact: true })
    .fill('Verify submitted legal identity proof');
  await panel.getByRole('button', { name: 'Access private review details', exact: true }).click();
  await expect(panel.getByText('Corrected Disposable Customer', { exact: true })).toBeVisible();
  await panel
    .getByLabel('Profile review decision reason', { exact: true })
    .fill('Submitted proof confirms corrected legal name');
  await panel.getByRole('button', { name: 'approve profile review', exact: true }).click();
  expect((await db.select().from(users).where(eq(users.id, subject)))[0]?.fullName).toBe(
    'Disposable Review Customer',
  );
  await panel.getByRole('button', { name: 'Confirm profile review decision', exact: true }).click();
  await expect
    .poll(async () => (await db.select().from(users).where(eq(users.id, subject)))[0]?.fullName)
    .toBe('Corrected Disposable Customer');
  await expect
    .poll(
      async () =>
        (
          await db
            .select()
            .from(profileReviewRequests)
            .where(eq(profileReviewRequests.id, review.id))
        )[0]?.status,
    )
    .toBe('approved');
});

test('HMA-015: moderator approves private photo and withdraws the current avatar through Web forms', async ({
  page,
  stack,
}) => {
  const db = stack.database.db,
    root = randomUUID(),
    moderator = randomUUID(),
    subject = randomUUID();
  const password = 'Disposable photo browser review phrase';
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.insert(users).values([
    { id: root, fullName: 'Disposable Photo Root' },
    {
      id: moderator,
      fullName: 'Disposable Photo Moderator',
      email: moderator + '@example.test',
      emailVerifiedAt: new Date(),
      passwordHash,
    },
    {
      id: subject,
      fullName: 'Disposable Photo Customer',
      email: subject + '@example.test',
      emailVerifiedAt: new Date(),
      passwordHash,
    },
  ]);
  await db.insert(adminAccounts).values({ userId: root, isRoot: true, status: 'active' });
  await db.insert(adminAccounts).values({ userId: moderator, isRoot: false, status: 'active' });
  await db
    .insert(adminRoleGrants)
    .values({ adminUserId: moderator, role: 'content_moderator', grantedByUserId: root });
  await db
    .insert(customerProfiles)
    .values({ userId: subject, age: 26, profileCompletedAt: new Date() });
  await signIn(page, subject + '@example.test', password);
  await expect(page).toHaveURL(/\/app/);
  await page
    .getByRole('button', { name: 'Profile correction and photo reviews', exact: true })
    .click();
  await page.getByRole('combobox', { name: /Review type/ }).selectOption('profile_photo');
  await page.getByLabel('Profile photo for review', { exact: true }).setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      // eslint-disable-next-line no-secrets/no-secrets -- public one-pixel PNG fixture
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('File checked and ready.', { exact: true })).toBeVisible();
  await page
    .getByLabel('Profile request reason', { exact: true })
    .fill('Review this requested private profile photo');
  await page.getByRole('button', { name: 'Review profile request', exact: true }).click();
  expect(
    (await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId,
  ).toBeNull();
  await page.getByRole('button', { name: 'Confirm profile request', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .select()
            .from(profileReviewRequests)
            .where(eq(profileReviewRequests.userId, subject))
        ).length,
    )
    .toBe(1);
  const [review] = await db
    .select()
    .from(profileReviewRequests)
    .where(eq(profileReviewRequests.userId, subject));
  if (!review?.proposedPhotoFileId) throw new Error('Disposable photo request missing');
  expect(
    (await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId,
  ).toBeNull();
  await page.context().clearCookies();
  await signIn(page, moderator + '@example.test', password);
  await expect(page).toHaveURL(/\/app/);
  await expect(
    page.getByRole('region', { name: 'identity correction reviews', exact: true }),
  ).toHaveCount(0);
  const board = page.getByRole('region', { name: 'profile photo reviews', exact: true });
  await board.getByRole('button', { name: 'Review case ' + review.id, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Profile review case', exact: true });
  await panel
    .getByLabel('Profile review access purpose', { exact: true })
    .fill('Verify the submitted private profile photo');
  await panel.getByRole('button', { name: 'Access private review details', exact: true }).click();
  await expect(
    panel.getByText('This photo is not currently displayed.', { exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Access evidence 1', exact: true }).click();
  const evidence = panel.getByRole('link', {
    name: 'Open authorized evidence (expires shortly)',
    exact: true,
  });
  await expect(evidence).toBeVisible();
  const url = await evidence.getAttribute('href');
  if (!url) throw new Error('Private photo access missing');
  const image = await page.context().request.get(url);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
  await panel
    .getByLabel('Profile review decision reason', { exact: true })
    .fill('Photo meets current profile photo policy');
  await panel.getByRole('button', { name: 'approve profile review', exact: true }).click();
  expect(
    (await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId,
  ).toBeNull();
  await panel.getByRole('button', { name: 'Confirm profile review decision', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId,
    )
    .toBe(review.proposedPhotoFileId);
  await board.getByLabel('profile_photo review status', { exact: true }).selectOption('approved');
  await board.getByRole('button', { name: 'Review case ' + review.id, exact: true }).click();
  await panel
    .getByLabel('Profile review access purpose', { exact: true })
    .fill('Review a newly reported current profile photo');
  await panel.getByRole('button', { name: 'Access private review details', exact: true }).click();
  await expect(
    panel.getByText('This is the current profile photo.', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/Revision 2 · approve/)).toBeVisible();
  await panel
    .getByLabel('Profile review decision reason', { exact: true })
    .fill('Withdraw current photo after confirmed policy report');
  await panel.getByRole('button', { name: 'withdraw profile review', exact: true }).click();
  expect((await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId).toBe(
    review.proposedPhotoFileId,
  );
  await panel.getByRole('button', { name: 'Confirm profile review decision', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.select().from(users).where(eq(users.id, subject)))[0]?.profilePhotoFileId,
    )
    .toBeNull();
  await board.getByLabel('profile_photo review status', { exact: true }).selectOption('withdrawn');
  await board.getByRole('button', { name: 'Review case ' + review.id, exact: true }).click();
  await expect(panel.getByText(/Revision 3 · withdraw/)).toBeVisible();
  await expect(panel.getByText(/Revision 2 · approve/)).toBeVisible();
});
