import { randomBytes, randomInt } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { notificationOutbox, notifications, users, managerAssignments } from '@hsm/db';
import { managementFixture } from '../integration/management-fixture.js';
import { hashPassword } from '../../src/auth/crypto.js';
import { authStack } from './fixture.js';
let stack: Awaited<ReturnType<typeof authStack>>;
beforeAll(async () => {
  stack = await authStack();
});
afterAll(async () => {
  await stack?.close();
});
async function post(path: string, body: unknown) {
  return fetch(stack.apiUrl + '/auth/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
async function delivered(subject: string, previous?: string) {
  const schema = z.object({
    ID: z.string(),
    Subject: z.string(),
    Text: z.string(),
    HTML: z.string(),
  });
  let result: z.infer<typeof schema> | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(stack.mailpitUrl + '/api/v1/message/latest');
        if (!response.ok) return false;
        const mail = schema.parse(await response.json());
        if (mail.Subject !== subject || mail.ID === previous) return false;
        result = mail;
        return true;
      },
      { timeout: 20000, interval: 200 },
    )
    .toBe(true);
  if (!result) throw new Error('Delivered mail missing');
  const code = result.Text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error('Delivered verification code missing');
  expect(result.HTML).toContain(code);
  return { ...result, code };
}
it('AUTH-C-001/002 / SEC: production API and worker deliver verification and recovery through real SMTP', async () => {
  const input = {
    fullName: 'Application Stack Person',
    email: randomBytes(12).toString('hex') + '@example.test',
    phone: '+923' + randomInt(0, 1000000000).toString().padStart(9, '0'),
    cnic: '35202' + randomInt(0, 100000000).toString().padStart(8, '0'),
    gender: 'male',
    dateOfBirth: '2000-01-01',
    password: 'Application stack password phrase',
  };
  expect((await post('register', input)).status).toBe(202);
  const verify = await delivered('Verify your email');
  const verified = await post('email/verify', {
    email: input.email,
    code: verify.code,
    client: 'mobile',
  });
  expect(verified.status).toBe(200);
  const credentials = z
    .object({ accessToken: z.string(), refreshToken: z.string() })
    .parse(await verified.json());
  expect(
    (
      await fetch(stack.apiUrl + '/me', {
        headers: { authorization: 'Bearer ' + credentials.accessToken },
      })
    ).status,
  ).toBe(200);
  expect((await post('password/forgot', { email: input.email })).status).toBe(202);
  const reset = await delivered('Reset your password', verify.ID);
  expect(
    (
      await post('password/reset', {
        email: input.email,
        code: reset.code,
        newPassword: 'Changed application stack password',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(stack.apiUrl + '/me', {
        headers: { authorization: 'Bearer ' + credentials.accessToken },
      })
    ).status,
  ).toBe(401);
  expect((await post('refresh', { refreshToken: credentials.refreshToken })).status).toBe(401);
  expect(
    (await post('login', { identifier: input.email, password: input.password, client: 'mobile' }))
      .status,
  ).toBe(401);
  expect(
    (
      await post('login', {
        identifier: input.email,
        password: 'Changed application stack password',
        client: 'mobile',
      })
    ).status,
  ).toBe(200);
  const messages = await stack.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientAddress, input.email));
  expect(messages).toHaveLength(2);
  expect(messages.every((message) => message.status === 'sent')).toBe(true);
  const recipientId = z.string().uuid().parse(messages[0]?.recipientUserId);
  await expect
    .poll(
      async () => {
        const inbox = await stack.database.db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, recipientId));
        return inbox.map((notice) => notice.type).sort();
      },
      { timeout: 20000, interval: 200 },
    )
    .toEqual(['account.email_verified', 'account.password_reset']);
  const inbox = await stack.database.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, recipientId));
  expect(inbox.every((notice) => notice.readAt === null && notice.deepLink === null)).toBe(true);
  expect(inbox.every((notice) => Object.keys(notice.data).length === 0)).toBe(true);
  const serialized = JSON.stringify(inbox);
  for (const sensitive of [input.email, input.password, input.cnic])
    expect(serialized).not.toContain(sensitive);
  expect(stack.processes()).toMatchObject({ api: null, worker: null });
}, 60000);

it('AUTH-M CHG-006: production API and worker verify an email on the existing phone-only Manager through real SMTP', async () => {
  const password = 'Production Manager permanent phrase';
  const hash = await hashPassword(password);
  const scope = await managementFixture(stack.database.db, hash, new Date());
  await stack.database.db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.id, scope.managerId));
  await stack.database.db
    .update(managerAssignments)
    .set({
      status: 'active',
      activatedAt: new Date(),
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
    })
    .where(eq(managerAssignments.id, scope.assignmentId));
  const login = await post('login', { identifier: scope.phone, password, client: 'mobile' });
  expect(login.status).toBe(200);
  const session = z
    .object({
      accessToken: z.string(),
      user: z.object({ id: z.literal(scope.managerId), email: z.null() }),
    })
    .parse(await login.json());
  const headers = {
    authorization: 'Bearer ' + session.accessToken,
    'Content-Type': 'application/json',
  };
  const email = randomBytes(12).toString('hex') + '@example.test';
  const previousResponse = await fetch(stack.mailpitUrl + '/api/v1/message/latest');
  const previous = previousResponse.ok
    ? z.object({ ID: z.string() }).parse(await previousResponse.json()).ID
    : undefined;
  const request = await fetch(stack.apiUrl + '/auth/email/associate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, currentPassword: password }),
    signal: AbortSignal.timeout(10000),
  });
  expect(request.status).toBe(202);
  const mail = await delivered('Verify your email', previous);
  const verified = await fetch(stack.apiUrl + '/auth/email/associate/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, code: mail.code }),
    signal: AbortSignal.timeout(10000),
  });
  expect(verified.status).toBe(200);
  const profile = z
    .object({
      user: z.object({ id: z.string(), email: z.string(), emailVerified: z.boolean() }),
      capabilities: z.object({ managerOf: z.array(z.object({ branchId: z.string() })) }),
    })
    .parse(await verified.json());
  expect(profile.user).toMatchObject({ id: scope.managerId, email, emailVerified: true });
  expect(profile.capabilities.managerOf).toEqual([{ branchId: scope.branchA }]);
  const [identity] = await stack.database.db
    .select()
    .from(users)
    .where(eq(users.id, scope.managerId));
  expect(identity).toMatchObject({
    passwordHash: hash,
    phoneE164: scope.phone,
    phoneVerifiedAt: null,
  });
  expect(
    (
      await fetch(stack.apiUrl + '/me', {
        headers: { authorization: headers.authorization },
        signal: AbortSignal.timeout(10000),
      })
    ).status,
  ).toBe(200);
});
