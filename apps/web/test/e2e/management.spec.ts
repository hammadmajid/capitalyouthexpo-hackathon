import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { eq } from 'drizzle-orm';
import { managerAssignments, sessions, users } from '@hsm/db';
import { managementFixture } from '@hsm/test-support';
import { test, expect } from './fixture';
import { emailAssociationAcceptance } from './email-association-flow';
test('MGR-004 / ACC-002: real manager activation, branch scope and immediate suspension rejection', async ({
  page,
  context,
  browser,
  stack,
}) => {
  const temporary = 'Public temporary manager fixture phrase';
  const password = 'Activated manager fixture phrase';
  const ownerPassword = 'Owner browser fixture phrase';
  const tempHash = await hash(temporary, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const fixture = await managementFixture(stack.database.db, tempHash, new Date());
  const ownerEmail = randomUUID() + '@example.test';
  await stack.database.db
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
    .where(eq(users.id, fixture.ownerId));
  await page.goto('/activate');
  await page.getByLabel('Invited mobile number (+92)', { exact: true }).fill(fixture.phone);
  await page.getByLabel('Temporary password', { exact: true }).fill(temporary);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Activate account', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app');
  await emailAssociationAcceptance(
    page,
    stack.database.db,
    stack.mailpitUrl,
    fixture.managerId,
    password,
  );
  const branches = page.getByRole('combobox', { name: 'Your branch' });
  await expect(branches.getByRole('option', { name: 'Branch A', exact: true })).toHaveCount(1);
  await expect(branches.getByRole('option', { name: 'Branch B', exact: true })).toHaveCount(0);
  await branches.selectOption(fixture.branchA);
  await expect(page.getByText('Selected: Branch A', { exact: true })).toBeVisible();
  expect((await context.request.get('/api/v1/manage/branches/' + fixture.branchB)).status()).toBe(
    403,
  );
  expect((await context.request.get('/api/v1/manage/branches/' + fixture.branchA)).status()).toBe(
    200,
  );
  const owner = await browser.newContext({ baseURL: stack.origin });
  try {
    const ownerPage = await owner.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('Email or mobile number', { exact: true }).fill(ownerEmail);
    await ownerPage.getByLabel('Password', { exact: true }).fill(ownerPassword);
    await ownerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(ownerPage).toHaveURL(stack.origin + '/app');
    const csrf = (await owner.cookies()).find((cookie) => cookie.name === 'hsm_csrf')?.value;
    if (!csrf) throw new Error('Owner CSRF binding missing');
    const endpoint =
      '/api/v1/manage/branches/' + fixture.branchA + '/managers/' + fixture.assignmentId;
    expect(
      (
        await owner.request.post(endpoint + '/suspend', {
          data: { reason: 'Integration suspension verification' },
          headers: { origin: stack.origin, 'x-csrf-token': decodeURIComponent(csrf) },
        })
      ).status(),
    ).toBe(200);
    const [assignment] = await stack.database.db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.id, fixture.assignmentId));
    expect(assignment?.status).toBe('suspended');
    const persisted = await stack.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, fixture.managerId));
    expect(persisted.length > 0 && persisted.every((session) => session.revokedAt !== null)).toBe(
      true,
    );
    await page.reload();
    await expect(page).toHaveURL(stack.origin + '/login?returnTo=' + encodeURIComponent('/app'));
    expect((await context.cookies()).some((cookie) => cookie.name === 'hsm_refresh')).toBe(false);
    expect(
      (
        await owner.request.post(endpoint + '/reinstate', {
          data: {},
          headers: { origin: stack.origin, 'x-csrf-token': decodeURIComponent(csrf) },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await stack.database.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, fixture.managerId))
      ).every((session) => session.revokedAt !== null),
    ).toBe(true);
    await page.getByLabel('Email or mobile number', { exact: true }).fill(fixture.phone);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(stack.origin + '/app');
    expect(
      (
        await owner.request.post(endpoint + '/deactivate', {
          data: {},
          headers: { origin: stack.origin, 'x-csrf-token': decodeURIComponent(csrf) },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(page).toHaveURL(stack.origin + '/login?returnTo=' + encodeURIComponent('/app'));
  } finally {
    await owner.close();
  }
});
