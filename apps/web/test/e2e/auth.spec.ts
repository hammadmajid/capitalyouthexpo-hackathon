import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import {
  users,
  sessions,
  notificationOutbox,
  customerProfiles,
  ownerProfiles,
  files,
} from '@hsm/db';
import { test, expect } from './fixture';
import { delivered } from './email';
import { ownerSetupAcceptance } from './owner-setup-flow';
import { customerSpaceAcceptance } from './customer-space-flow';
test('AUTH-C / SEC-001: real registration, OTP, cookie session, revocation and recovery', async ({
  page,
  context,
  stack,
}) => {
  const email = randomBytes(12).toString('hex') + '@example.test';
  const password = 'Browser integration password phrase';
  const changed = 'Changed browser integration phrase';
  await page.goto('/register?returnTo=' + encodeURIComponent('/app/customer-profile'));
  await expect(page.getByLabel('CNIC number', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send email code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  const verified = await delivered(stack.mailpitUrl, 'Verify your email');
  const [pending] = await stack.database.db.select().from(users).where(eq(users.email, email));
  if (!pending) throw new Error('Pending registration identity missing');
  expect(pending.passwordHash).toBeNull();
  expect(
    await stack.database.db.select().from(sessions).where(eq(sessions.userId, pending.id)),
  ).toHaveLength(0);
  expect(
    (await context.cookies()).filter((cookie) =>
      ['hsm_access', 'hsm_refresh'].includes(cookie.name),
    ),
  ).toHaveLength(0);
  await page.getByLabel('Six-digit email code', { exact: true }).fill(verified.code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set your password', exact: true })).toBeVisible();
  expect(
    await stack.database.db.select().from(sessions).where(eq(sessions.userId, pending.id)),
  ).toHaveLength(0);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/customer-profile');
  await expect(page.getByRole('link', { name: 'Customer', exact: true })).toHaveCount(0);
  await page.getByLabel('Full name', { exact: true }).fill('Browser Foundation Person');
  await page
    .getByLabel('Mobile number', { exact: true })
    .fill('+923' + randomInt(0, 1000000000).toString().padStart(9, '0'));
  await page.getByLabel('Age (18 or older)', { exact: true }).fill('26');
  await page.getByLabel('Gender', { exact: true }).selectOption('male');
  await page.getByRole('button', { name: 'Save Customer profile', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/customer');
  await expect(page.getByRole('navigation', { name: 'Account spaces' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customer', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Owner', exact: true })).toHaveCount(0);
  await customerSpaceAcceptance(page, context, stack.origin);
  const cookies = await context.cookies();
  expect(
    cookies
      .filter((cookie) => ['hsm_access', 'hsm_refresh'].includes(cookie.name))
      .every((cookie) => cookie.httpOnly && cookie.sameSite === 'Lax'),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === 'hsm_csrf' && !cookie.httpOnly)).toBe(true);
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  expect(storage).toEqual({ local: 0, session: 0 });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Account spaces' })).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  const [identity] = await stack.database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!identity) throw new Error('Persisted identity missing');
  const persisted = await stack.database.db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, identity.id));
  expect(persisted.length > 0).toBe(true);
  expect(persisted.every((session) => session.revokedAt === null)).toBe(true);
  let rotations = 0;
  context.on('request', (request) => {
    if (request.url().endsWith('/api/v1/auth/refresh')) rotations++;
  });
  await context.clearCookies({ name: /^(?:__Host-)?hsm_access$/ });
  const otherTab = await context.newPage();
  await Promise.all([page.reload(), otherTab.goto(stack.origin + '/app')]);
  await expect(page.getByRole('navigation', { name: 'Account spaces' })).toBeVisible();
  await expect(otherTab.getByRole('navigation', { name: 'Account spaces' })).toBeVisible();
  expect(rotations).toBe(1);
  const lineage = await stack.database.db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, identity.id));
  expect(lineage).toHaveLength(2);
  expect(lineage.filter((session) => session.revokedAt === null)).toHaveLength(1);
  expect(
    lineage.some(
      (session) => session.revokedReason === 'rotated' && session.replacedBySessionId !== null,
    ),
  ).toBe(true);
  await otherTab.close();
  const rejected = await context.request.post('/api/v1/auth/logout', {
    data: {},
    headers: { origin: stack.origin },
  });
  expect(rejected.status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/login');
  expect(
    (await stack.database.db.select().from(sessions).where(eq(sessions.userId, identity.id))).every(
      (session) => session.revokedAt !== null,
    ),
  ).toBe(true);
  await page.goto('/recover');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await expect(page.getByRole('status')).toContainText('If this account');
  const reset = await delivered(stack.mailpitUrl, 'Reset your password', verified.ID);
  await page.goto('/reset');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Six-digit email code', { exact: true }).fill(reset.code);
  await page.getByLabel('New password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been reset');
  await page.goto('/app/security');
  await expect(page).toHaveURL(
    stack.origin + '/login?returnTo=' + encodeURIComponent('/app/security'),
  );
  await page.getByLabel('Email or mobile number', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/security');
  await expect
    .poll(
      async () =>
        (
          await stack.database.db
            .select()
            .from(notificationOutbox)
            .where(eq(notificationOutbox.recipientUserId, identity.id))
        ).every((row) => row.status === 'sent'),
      { timeout: 20000 },
    )
    .toBe(true);
  await page.getByRole('link', { name: 'Account security', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill(changed);
  await page
    .getByLabel('New password', { exact: true })
    .fill('Final browser fixture password phrase');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await page.getByRole('button', { name: 'Sign out all devices', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/login');
  expect(
    (await stack.database.db.select().from(sessions).where(eq(sessions.userId, identity.id))).every(
      (session) => session.revokedAt !== null,
    ),
  ).toBe(true);
});
test('SEC-001: responsive public pages have CSP and accessible controls', async ({
  page,
  stack,
}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const response = await page.goto('/login');
    expect(response?.headers()['content-security-policy']).toContain("'strict-dynamic'");
    expect(response?.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();
    await expect(
      page.getByRole('heading', { name: 'Sign in to your space', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.goto('/app/owner');
  await expect(page).toHaveURL(
    stack.origin + '/login?returnTo=' + encodeURIComponent('/app/owner'),
  );
});

test('CHG-006 SEC-001: guests can open the public shell and preserve a supported destination through signup', async ({
  page,
  stack,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(stack.origin + '/');
  // Guest-first marketplace home (CHG-006 / SRS v2.2): search is public, mutations need sign-in.
  await expect(page.getByRole('heading', { name: 'Find Your Perfect Hostel' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Search hostels' })).toBeVisible();
  await page.getByRole('link', { name: 'Manage your hostel' }).click();
  await expect(page).toHaveURL(
    stack.origin + '/login?returnTo=' + encodeURIComponent('/app/owner'),
  );
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(
    stack.origin + '/register?returnTo=' + encodeURIComponent('/app/owner'),
  );
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('CNIC number', { exact: true })).toHaveCount(0);
});

// AUTH-C: fixture creation establishes only a Customer; Owner evidence is real browser/API/storage work.
test('AUTH-C CHG-006: real private Owner evidence upload and additive capability', async ({
  page,
  stack,
}) => {
  const id = randomUUID(),
    email = id + '@example.test';
  const name = 'Private Owner Browser Person',
    password = 'Owner private browser fixture phrase';
  const phone = '+923' + randomInt(0, 1000000000).toString().padStart(9, '0');
  const cnic = '61101' + randomInt(0, 100000000).toString().padStart(8, '0');
  await stack.database.db.insert(users).values({
    id,
    email,
    fullName: name,
    phoneE164: phone,
    gender: 'male',
    emailVerifiedAt: new Date(),
    passwordHash: await hash(password, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  });
  await stack.database.db
    .insert(customerProfiles)
    .values({ userId: id, age: 26, profileCompletedAt: new Date() });
  await page.goto('/login?returnTo=' + encodeURIComponent('/app/owner-profile'));
  await page.getByLabel('Email or mobile number', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/owner-profile');
  await expect(page.getByRole('link', { name: 'Customer', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Owner', exact: true })).toHaveCount(0);
  const evidence = Buffer.from('%PDF-1.7\nprivate browser verification document\n');
  await page
    .getByLabel('CNIC front', { exact: true })
    .setInputFiles({ name: 'front.pdf', mimeType: 'application/pdf', buffer: evidence });
  await expect(page.getByText('File checked and ready.', { exact: true })).toHaveCount(1);
  await page
    .getByLabel('CNIC back', { exact: true })
    .setInputFiles({ name: 'back.pdf', mimeType: 'application/pdf', buffer: evidence });
  await expect(page.getByText('File checked and ready.', { exact: true })).toHaveCount(2);
  await page.getByLabel('Full name', { exact: true }).fill(name);
  await page.getByLabel('Mobile number', { exact: true }).fill(phone);
  await page.getByLabel('CNIC number', { exact: true }).fill(cnic);
  await page.getByLabel('Owner address', { exact: true }).fill('Private browser Owner address');
  await page.getByRole('checkbox', { name: 'I accept this Owner agreement.', exact: true }).check();
  await page.getByRole('button', { name: 'Save Owner profile', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/owner');
  await expect(page.getByRole('link', { name: 'Customer', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Owner', exact: true })).toBeVisible();
  const [owner] = await stack.database.db
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, id));
  expect(Boolean(owner && owner.cnicFrontFileId !== owner.cnicBackFileId)).toBe(true);
  expect(owner?.agreementVersion === 'owner-foundation-v1').toBe(true);
  const persisted = await stack.database.db.select().from(users).where(eq(users.id, id));
  expect(persisted.length).toBe(1);
  expect(Boolean(persisted[0]?.cnicEncrypted?.length && persisted[0]?.cnicHash?.length)).toBe(true);
  expect(persisted[0]?.cnicLast4 === cnic.slice(-4)).toBe(true);
  const attachments = await stack.database.db.select().from(files).where(eq(files.uploadedBy, id));
  expect(attachments.length).toBe(2);
  expect(
    attachments.every(
      (file) =>
        file.scanStatus === 'clean' &&
        file.purpose === 'verification_document' &&
        file.bucket === stack.storage.bucket,
    ),
  ).toBe(true);
  const privateRead = await fetch(
    stack.storage.env.S3_ENDPOINT + '/' + stack.storage.bucket + '/' + attachments[0]?.objectKey,
    { signal: AbortSignal.timeout(10000) },
  );
  expect(privateRead.status === 403).toBe(true);
  await ownerSetupAcceptance(page, stack.database.db, id);
  await page.getByRole('link', { name: 'Customer', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app/customer');
  await expect(page.getByRole('link', { name: 'Owner', exact: true })).toBeVisible();
});
