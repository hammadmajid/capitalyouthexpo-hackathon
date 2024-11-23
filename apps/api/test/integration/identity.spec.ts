import { randomBytes, randomInt } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { customerProfiles, emailOtps, notificationOutbox, sessions, users } from '@hsm/db';
import { AuthCrypto, verifyPassword } from '../../src/auth/crypto.js';
import { authFixture } from './auth-fixture.js';
import { SessionService } from '../../src/auth/session.service.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const now = new Date('2026-10-07T12:00:00Z');
let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
});
afterAll(async () => {
  await fixture?.close();
});
function registration() {
  return {
    fullName: 'HTTP Identity',
    email: randomBytes(12).toString('hex') + '@example.com',
    phone: '+923' + randomInt(0, 1000000000).toString().padStart(9, '0'),
    cnic: '35202' + randomInt(0, 100000000).toString().padStart(8, '0'),
    gender: 'male',
    dateOfBirth: '2000-01-01',
    password: 'A protected integration phrase',
  };
}
function post(path: string, payload: Record<string, unknown>) {
  return fixture.application.inject({ method: 'POST', url: '/v1/auth/' + path, payload });
}
async function code(email: string, purpose: string) {
  const messages = await fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientAddress, email))
    .orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id));
  for (const message of messages) {
    const envelope = z.string().parse(message.payload.envelope);
    const body = z
      .object({ code: z.string(), purpose: z.string() })
      .parse(JSON.parse(crypto.decrypt(Buffer.from(envelope, 'base64'), 'email')));
    if (body.purpose === purpose) return body.code;
  }
  throw new Error('Missing encrypted OTP outbox message');
}
async function verified() {
  const input = registration();
  expect((await post('register', input)).statusCode).toBe(202);
  const response = await post('email/verify', {
    email: input.email,
    code: await code(input.email, 'signup_verify'),
    client: 'mobile',
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().capabilities.customer).toBe(true);
  expect(response.json().user.cnicLast4).toBe(input.cnic.slice(-4));
  expect(response.json().user).not.toHaveProperty('cnicEncrypted');
  return { input, credentials: response.json<{ accessToken: string; refreshToken: string }>() };
}
it('AUTH-C-001/002: real registration atomically persists protected identity, profile and one-time OTP', async () => {
  const { input } = await verified();
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.email, input.email));
  if (!user) throw new Error('Registration fixture missing');
  expect(user.emailVerifiedAt).toEqual(now);
  expect(user.cnicLast4).toBe(input.cnic.slice(-4));
  expect(user.cnicEncrypted).not.toEqual(Buffer.from(input.cnic));
  expect(await verifyPassword(user.passwordHash, input.password)).toBe(true);
  const profiles = await fixture.connection.db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, user.id));
  expect(profiles).toHaveLength(1);
  const otps = await fixture.connection.db
    .select()
    .from(emailOtps)
    .where(eq(emailOtps.userId, user.id));
  expect(otps[0]?.consumedAt).toEqual(now);
  expect(
    (
      await post('email/verify', {
        email: input.email,
        code: await code(input.email, 'signup_verify'),
      })
    ).statusCode,
  ).toBe(401);
  expect((await post('register', input)).statusCode).toBe(409);
});
it('SEC: real login-to-refresh reuse revokes the family and the next protected HTTP call fails', async () => {
  const { input } = await verified();
  const login = await post('login', {
    identifier: input.email.toUpperCase(),
    password: input.password,
    client: 'mobile',
  });
  expect(login.statusCode).toBe(200);
  const a = login.json<{ accessToken: string; refreshToken: string }>();
  const protectedCall = (token: string) =>
    fixture.application.inject({
      url: '/v1/me',
      headers: { authorization: 'Bearer ' + token },
    });
  expect((await protectedCall(a.accessToken)).statusCode).toBe(200);
  const rotated = await post('refresh', { refreshToken: a.refreshToken });
  expect(rotated.statusCode).toBe(200);
  const b = rotated.json<{ accessToken: string; refreshToken: string }>();
  expect((await post('refresh', { refreshToken: a.refreshToken })).statusCode).toBe(401);
  expect((await post('refresh', { refreshToken: b.refreshToken })).statusCode).toBe(401);
  expect((await protectedCall(b.accessToken)).statusCode).toBe(401);
});
it('SEC: reset consumes purpose-bound OTP, changes the Argon2 hash and revokes existing HTTP sessions', async () => {
  const { input, credentials } = await verified();
  expect((await post('password/forgot', { email: input.email })).json()).toEqual({
    accepted: true,
  });
  expect((await post('password/forgot', { email: 'unknown@example.com' })).json()).toEqual({
    accepted: true,
  });
  const otp = await code(input.email, 'password_reset');
  const newPassword = 'A replacement integration phrase';
  expect(
    (await post('password/reset', { email: input.email, code: otp, newPassword })).statusCode,
  ).toBe(200);
  expect(
    (await post('password/reset', { email: input.email, code: otp, newPassword })).statusCode,
  ).toBe(401);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me',
        headers: { authorization: 'Bearer ' + credentials.accessToken },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await post('login', { identifier: input.email, password: input.password, client: 'mobile' }))
      .statusCode,
  ).toBe(401);
  expect(
    (await post('login', { identifier: input.phone, password: newPassword, client: 'mobile' }))
      .statusCode,
  ).toBe(200);
});
it('SEC: account deactivation affects the next protected call and concurrent registration cannot duplicate identity', async () => {
  const { input, credentials } = await verified();
  await fixture.connection.db
    .update(users)
    .set({ accountStatus: 'deactivated' })
    .where(eq(users.email, input.email));
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me',
        headers: { authorization: 'Bearer ' + credentials.accessToken },
      })
    ).statusCode,
  ).toBe(403);
  const duplicate = registration();
  const results = await Promise.all([post('register', duplicate), post('register', duplicate)]);
  expect(results.map((value) => value.statusCode).sort()).toEqual([202, 409]);
  const rows = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.email, duplicate.email));
  expect(rows).toHaveLength(1);
  const user = rows[0];
  if (!user) throw new Error('Missing identity');
  const active = await fixture.connection.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), eq(sessions.client, 'mobile')));
  expect(active).toHaveLength(0);
});

it('SEC: real password change preserves the current device and revokes other access/refresh credentials', async () => {
  const { input, credentials } = await verified();
  const login = await post('login', {
    identifier: input.email,
    password: input.password,
    client: 'mobile',
  });
  expect(login.statusCode).toBe(200);
  const other = login.json<{ accessToken: string; refreshToken: string }>();
  const headers = { authorization: 'Bearer ' + credentials.accessToken };
  const change = (currentPassword: string) =>
    fixture.application.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      headers,
      payload: { currentPassword, newPassword: 'New protected password change phrase' },
    });
  expect((await change('Incorrect password phrase')).statusCode).toBe(401);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me',
        headers: { authorization: 'Bearer ' + other.accessToken },
      })
    ).statusCode,
  ).toBe(200);
  const response = await change(input.password);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ changed: true });
  expect((await fixture.application.inject({ url: '/v1/me', headers })).statusCode).toBe(200);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me',
        headers: { authorization: 'Bearer ' + other.accessToken },
      })
    ).statusCode,
  ).toBe(401);
  expect((await post('refresh', { refreshToken: other.refreshToken })).statusCode).toBe(401);
  expect(
    (await post('login', { identifier: input.email, password: input.password, client: 'mobile' }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await post('login', {
        identifier: input.email,
        password: 'New protected password change phrase',
        client: 'mobile',
      })
    ).statusCode,
  ).toBe(200);
});

it('SEC: real password update rolls back when device revocation fails in its transaction', async () => {
  const { input, credentials } = await verified();
  const actor = await fixture.service.authenticate(credentials.accessToken);
  const repository = fixture.repository;
  const failing = new SessionService(
    {
      identify: (hash) => repository.identify(hash),
      transaction: (userId, work) =>
        repository.transaction(userId, (transaction) =>
          work({
            identity: transaction.identity,
            list: () => transaction.list(),
            insert: (value) => transaction.insert(value),
            rotate: (id, next, at) => transaction.rotate(id, next, at),
            setPassword: (hash, at) => transaction.setPassword(hash, at),
            revoke: async () => {
              throw new Error('Injected revocation failure');
            },
          }),
        ),
    },
    crypto,
    () => now,
  );
  await expect(
    failing.changePassword(
      actor.userId,
      actor.sessionId,
      input.password,
      'Rollback replacement password phrase',
    ),
  ).rejects.toThrow('Injected revocation failure');
  const [user] = await fixture.connection.db.select().from(users).where(eq(users.id, actor.userId));
  expect(await verifyPassword(user?.passwordHash ?? null, input.password)).toBe(true);
  expect(
    await verifyPassword(user?.passwordHash ?? null, 'Rollback replacement password phrase'),
  ).toBe(false);
  expect(await fixture.service.authenticate(credentials.accessToken)).toEqual(actor);
});

it('AUTH-C / CHG-006: pending email-first identity cannot create a normal session through legacy verification or recovery', async () => {
  const email = randomBytes(12).toString('hex') + '@example.test';
  const [pending] = await fixture.connection.db
    .insert(users)
    .values({ fullName: '', email })
    .returning();
  if (!pending) throw new Error('Missing pending identity');
  await fixture.otp.request(email, 'signup_verify');
  const response = await post('email/verify', {
    email,
    code: await code(email, 'signup_verify'),
    client: 'mobile',
  });
  expect(response.statusCode).toBe(401);
  expect(response.json()).not.toHaveProperty('accessToken');
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, pending.id)),
  ).toHaveLength(0);
  expect((await post('password/forgot', { email })).statusCode).toBe(202);
  expect(
    await fixture.connection.db
      .select()
      .from(emailOtps)
      .where(and(eq(emailOtps.userId, pending.id), eq(emailOtps.purpose, 'password_reset'))),
  ).toHaveLength(0);
  const [persisted] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, pending.id));
  expect(persisted?.passwordHash).toBeNull();
});
