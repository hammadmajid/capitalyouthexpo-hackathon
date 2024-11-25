import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  customerProfiles,
  emailOtps,
  notificationOutbox,
  registrationSetups,
  sessions,
  users,
} from '@hsm/db';
import { AuthCrypto, hashPassword, verifyPassword } from '../../src/auth/crypto.js';
import { RegistrationRepository } from '../../src/auth/registration.repository.js';
import { RegistrationService } from '../../src/auth/registration.service.js';
import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { OtpService } from '../../src/auth/otp.service.js';
import { authFixture } from './auth-fixture.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let now = new Date('2026-10-10T12:00:00Z');
let fixture: Awaited<ReturnType<typeof authFixture>>;
let repository: RegistrationRepository;
let service: RegistrationService;
const password = 'A real registration integration phrase';
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  repository = new RegistrationRepository(fixture.connection.db);
  service = new RegistrationService(
    repository,
    crypto,
    fixture.service,
    new ProfileRepository(fixture.connection.db),
    () => now,
  );
});
afterAll(async () => {
  await fixture?.close();
});
const emailAddress = () => randomUUID() + '@example.test';
async function identity(email: string) {
  const [user] = await fixture.connection.db.select().from(users).where(eq(users.email, email));
  if (!user) throw new Error('Missing registration identity');
  return user;
}
async function delivered(email: string) {
  const [message] = await fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.recipientAddress, email),
        eq(notificationOutbox.eventType, 'auth.otp'),
      ),
    )
    .orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id))
    .limit(1);
  const envelope = z.string().parse(message?.payload.envelope);
  return z
    .object({ code: z.string() })
    .parse(JSON.parse(crypto.decrypt(Buffer.from(envelope, 'base64'), 'email'))).code;
}
async function pendingGrant(email = emailAddress()) {
  await service.start({ email });
  const result = await service.verify({ email, code: await delivered(email) });
  if (result.next !== 'password') throw new Error('Missing registration grant');
  return { email, result, user: await identity(email) };
}
it('AUTH-C: concurrent email-first start preserves one identity, OTP and outbox without a password or capability', async () => {
  const email = emailAddress();
  expect(await Promise.all([service.start({ email }), service.start({ email })])).toEqual([
    { verificationRequired: true },
    { verificationRequired: true },
  ]);
  const records = await fixture.connection.db.select().from(users).where(eq(users.email, email));
  expect(records).toHaveLength(1);
  const user = records[0];
  if (!user) throw new Error('Missing identity');
  expect(user).toMatchObject({
    passwordHash: null,
    phoneE164: null,
    cnicHash: null,
    emailVerifiedAt: null,
  });
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, user.id)),
  ).toHaveLength(0);
  expect(
    await fixture.connection.db.select().from(emailOtps).where(eq(emailOtps.userId, user.id)),
  ).toHaveLength(1);
  expect(
    await fixture.connection.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientAddress, email)),
  ).toHaveLength(1);
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
  ).toHaveLength(0);
});
it('AUTH-C: real verification creates a digest-only expiring grant; password establishment creates the first session', async () => {
  const { email, result, user } = await pendingGrant();
  expect(user.emailVerifiedAt).toEqual(now);
  expect(user.passwordHash).toBeNull();
  expect(result).not.toHaveProperty('accessToken');
  const [grant] = await fixture.connection.db
    .select()
    .from(registrationSetups)
    .where(eq(registrationSetups.userId, user.id));
  expect(grant?.tokenHash).toBe(crypto.digest('registration-password:' + result.setupToken, 'otp'));
  expect(grant?.tokenHash).not.toBe(result.setupToken);
  expect(grant?.expiresAt).toEqual(new Date(now.getTime() + 600000));
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
  ).toHaveLength(0);
  const credentials = await service.password({
    setupToken: result.setupToken,
    password,
    client: 'mobile',
  });
  expect(await verifyPassword((await identity(email)).passwordHash, password)).toBe(true);
  expect(credentials).toMatchObject({
    client: 'mobile',
    capabilities: { customer: false, owner: false },
  });
  const persisted = await fixture.connection.db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, user.id));
  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.revokedAt).toBeNull();
  await expect(
    service.password({ setupToken: result.setupToken, password, client: 'mobile' }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  await expect(service.verify({ email, code: await delivered(email) })).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
});
it('SEC: failed OTP attempts persist through real transactions and cannot produce a grant', async () => {
  const email = emailAddress();
  await service.start({ email });
  const correct = await delivered(email),
    wrong = correct === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++)
    await expect(service.verify({ email, code: wrong })).rejects.toThrow();
  await expect(service.verify({ email, code: correct })).rejects.toThrow();
  const user = await identity(email);
  const [otp] = await fixture.connection.db
    .select()
    .from(emailOtps)
    .where(eq(emailOtps.userId, user.id));
  expect(otp?.attempts).toBe(5);
  expect(otp?.consumedAt).toBeNull();
  expect(user.emailVerifiedAt).toBeNull();
  expect(
    await fixture.connection.db
      .select()
      .from(registrationSetups)
      .where(eq(registrationSetups.userId, user.id)),
  ).toHaveLength(0);
});
it('SEC: concurrent setup consumption permits exactly one permanent password and one first session', async () => {
  const { email, result, user } = await pendingGrant();
  const results = await Promise.allSettled([
    service.password({ setupToken: result.setupToken, password, client: 'mobile' }),
    service.password({
      setupToken: result.setupToken,
      password: password + ' alternative',
      client: 'mobile',
    }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect((await identity(email)).passwordHash).not.toBeNull();
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
  ).toHaveLength(1);
  expect(
    await fixture.connection.db
      .select()
      .from(registrationSetups)
      .where(and(eq(registrationSetups.userId, user.id), isNull(registrationSetups.consumedAt))),
  ).toHaveLength(0);
});
it('SEC: inclusive setup expiry leaves password and session persistence unchanged', async () => {
  const { email, result, user } = await pendingGrant();
  now = new Date(now.getTime() + 600000);
  await expect(
    service.password({ setupToken: result.setupToken, password, client: 'mobile' }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect((await identity(email)).passwordHash).toBeNull();
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
  ).toHaveLength(0);
});
it('SEC: signup proof verifies an existing permanent identity without issuing a setup grant or changing its password', async () => {
  const email = emailAddress(),
    hash = await hashPassword(password);
  const [user] = await fixture.connection.db
    .insert(users)
    .values({ fullName: 'Existing identity', email, passwordHash: hash })
    .returning();
  if (!user) throw new Error('Missing identity');
  await service.start({ email });
  expect(await service.verify({ email, code: await delivered(email) })).toEqual({ next: 'login' });
  expect((await identity(email)).passwordHash).toBe(hash);
  expect(
    await fixture.connection.db
      .select()
      .from(registrationSetups)
      .where(eq(registrationSetups.userId, user.id)),
  ).toHaveLength(0);
  expect(
    await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
  ).toHaveLength(0);
});
it('SEC: replacement proof retires an earlier grant while preserving setup history', async () => {
  const first = await pendingGrant();
  now = new Date(now.getTime() + 60000);
  await service.start({ email: first.email });
  const second = await service.verify({ email: first.email, code: await delivered(first.email) });
  if (second.next !== 'password') throw new Error('Missing replacement grant');
  expect(second.setupToken).not.toBe(first.result.setupToken);
  await expect(
    service.password({ setupToken: first.result.setupToken, password, client: 'mobile' }),
  ).rejects.toThrow();
  expect((await identity(first.email)).passwordHash).toBeNull();
  const grants = await fixture.connection.db
    .select()
    .from(registrationSetups)
    .where(eq(registrationSetups.userId, first.user.id));
  expect(grants).toHaveLength(2);
  expect(grants.filter((grant) => grant.consumedAt === null)).toHaveLength(1);
  expect(
    await service.password({ setupToken: second.setupToken, password, client: 'mobile' }),
  ).toMatchObject({ client: 'mobile' });
});
it('NTF-002: a real setup uniqueness failure rolls back OTP consumption and email verification together', async () => {
  const email = emailAddress(),
    hash = 'b'.repeat(64);
  await service.start({ email });
  const user = await identity(email);
  await fixture.connection.db.insert(registrationSetups).values({
    userId: user.id,
    tokenHash: hash,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 600000),
  });
  const otp = new OtpService(repository, crypto, () => now);
  await expect(
    otp.verify(email, await delivered(email), 'signup_verify', async (transaction, date) => {
      await transaction.verifyEmail(date);
      await repository.grant(transaction, hash, date);
    }),
  ).rejects.toThrow();
  const [persisted] = await fixture.connection.db
    .select()
    .from(emailOtps)
    .where(eq(emailOtps.userId, user.id));
  expect(persisted?.attempts).toBe(0);
  expect(persisted?.consumedAt).toBeNull();
  expect((await identity(email)).emailVerifiedAt).toBeNull();
  const [original] = await fixture.connection.db
    .select()
    .from(registrationSetups)
    .where(eq(registrationSetups.tokenHash, hash));
  expect(original?.consumedAt).toBeNull();
});

it.each(['mobile', 'web'] as const)(
  'AUTH-C-001/002 SEC: real staged HTTP %s setup persists one session and enforces protected logout',
  async (client) => {
    const email = emailAddress();
    const server = fixture.application.getHttpAdapter().getInstance();
    const start = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/start',
      payload: { email },
    });
    expect(start.statusCode).toBe(202);
    expect(start.cookies).toHaveLength(0);
    const user = await identity(email);
    expect(user.passwordHash).toBeNull();
    const verified = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/verify',
      payload: { email, code: await delivered(email) },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.headers['cache-control']).toBe('no-store');
    expect(verified.cookies).toHaveLength(0);
    const grant = z
      .object({ next: z.literal('password'), setupToken: z.string(), expiresIn: z.literal(600) })
      .strict()
      .parse(verified.json());
    expect(
      await fixture.connection.db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toHaveLength(0);
    expect(
      (
        await server.inject({
          url: '/v1/me',
          headers: { authorization: 'Bearer ' + grant.setupToken },
        })
      ).statusCode,
    ).toBe(401);
    const setup = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/password',
      payload: { setupToken: grant.setupToken, password, client },
    });
    expect(setup.statusCode).toBe(200);
    expect(setup.headers['cache-control']).toBe('no-store');
    expect(await verifyPassword((await identity(email)).passwordHash, password)).toBe(true);
    expect(setup.json().capabilities).toEqual({
      customer: false,
      owner: false,
      managerOf: [],
      admin: null,
    });
    const replay = await server.inject({
      method: 'POST',
      url: '/v1/auth/registration/password',
      payload: { setupToken: grant.setupToken, password, client },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.cookies).toHaveLength(0);
    const headers: Record<string, string> = {};
    if (client === 'web') {
      expect(setup.json()).not.toHaveProperty('accessToken');
      expect(setup.json()).not.toHaveProperty('refreshToken');
      expect(setup.cookies).toHaveLength(3);
      expect(setup.cookies.find((cookie) => cookie.name === 'hsm_refresh')).toMatchObject({
        httpOnly: true,
        path: '/',
      });
      headers.cookie = setup.cookies.map((cookie) => cookie.name + '=' + cookie.value).join('; ');
      expect(
        (await server.inject({ method: 'POST', url: '/v1/auth/logout', headers })).statusCode,
      ).toBe(403);
      const csrf = setup.cookies.find((cookie) => cookie.name === 'hsm_csrf')?.value;
      if (!csrf) throw new Error('Missing CSRF fixture');
      headers['x-csrf-token'] = csrf;
    } else {
      expect(setup.cookies).toHaveLength(0);
      const access = z.string().parse(setup.json().accessToken);
      headers.authorization = 'Bearer ' + access;
    }
    expect((await server.inject({ url: '/v1/me', headers })).statusCode).toBe(200);
    expect(
      (await server.inject({ method: 'POST', url: '/v1/auth/logout', headers })).statusCode,
    ).toBe(200);
    expect((await server.inject({ url: '/v1/me', headers })).statusCode).toBe(401);
    const persisted = await fixture.connection.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.revokedAt).not.toBeNull();
  },
);
