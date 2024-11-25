import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users, type Database } from '@hsm/db';
import { expect } from './fixture';
import { delivered } from './email';
export async function emailAssociationAcceptance(
  page: Page,
  database: Database,
  mailpit: string,
  userId: string,
  password: string,
) {
  const [before] = await database.select().from(users).where(eq(users.id, userId));
  if (!before) throw new Error('Activated Manager fixture missing');
  const email = randomUUID() + '@example.test';
  const previousResponse = await fetch(mailpit + '/api/v1/message/latest');
  const previous = previousResponse.ok
    ? z.object({ ID: z.string() }).parse(await previousResponse.json()).ID
    : undefined;

  await expect(
    page.getByRole('link', { name: 'Complete Customer profile', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(page.getByLabel('Email verification code', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  const code = await delivered(mailpit, 'Verify your email', previous);
  await page.getByLabel('Email verification code', { exact: true }).fill(code.code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Complete Customer profile', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Complete Owner profile', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Email verification code', { exact: true })).toHaveCount(0);
  const [after] = await database.select().from(users).where(eq(users.id, userId));
  expect(after).toMatchObject({
    email,
    passwordHash: before.passwordHash,
    phoneE164: before.phoneE164,
    phoneVerifiedAt: null,
  });
  expect(after?.emailVerifiedAt).not.toBeNull();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Manager', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email verification code', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
}
