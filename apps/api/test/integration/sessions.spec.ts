import { authFixture } from './auth-fixture.js';
import { randomBytes } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { OtpRepository } from '../../src/auth/otp.repository.js';
import { OtpService } from '../../src/auth/otp.service.js';
import { createDatabase, users, sessions, emailOtps, notificationOutbox } from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { SessionRepository } from '../../src/auth/session.repository.js';
import { SessionService } from '../../src/auth/session.service.js';
let fixture: Awaited<ReturnType<typeof authFixture>>;
let application: NestFastifyApplication;
let connection: ReturnType<typeof createDatabase>;
let repository: SessionRepository;
let service: SessionService;
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const now = new Date('2026-10-07T12:00:00Z');
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  ({ connection, application, repository, service } = fixture);
});
afterAll(async () => {
  await fixture?.close();
});
async function identity() {
  const [row] = await connection.db
    .insert(users)
    .values({ fullName: 'Session integration' })
    .returning();
  if (!row) throw new Error('Identity fixture failed');
  return row.id;
}
it('SEC: persisted rotation/reuse revokes its complete family and preserves another device', async () => {
  const id = await identity();
  const a = await service.issue(id, 'web');
  const other = await service.issue(id, 'mobile');
  const b = await service.refresh(a.refreshToken);
  const c = await service.refresh(b.refreshToken);
  await expect(service.refresh(a.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  await expect(service.refresh(c.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  await expect(service.authenticate(c.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(await service.authenticate(other.accessToken)).toMatchObject({ userId: id });
  const rows = await connection.db.select().from(sessions).where(eq(sessions.userId, id));
  expect(rows.filter((row) => row.revokedReason === 'refresh_reuse')).toHaveLength(3);
  expect(rows.some((row) => row.refreshTokenHash === a.refreshToken)).toBe(false);
});
it('SEC: simultaneous refresh serializes and reuse invalidates the winning replacement', async () => {
  const id = await identity();
  const a = await service.issue(id, 'mobile');
  const results = await Promise.allSettled([
    service.refresh(a.refreshToken),
    service.refresh(a.refreshToken),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const winner = results.find((result) => result.status === 'fulfilled');
  if (!winner || winner.status !== 'fulfilled') throw new Error('No rotation winner');
  await expect(service.authenticate(winner.value.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
});
it('SEC: account suspension and logout affect the next persisted access check', async () => {
  const id = await identity();
  const a = await service.issue(id, 'mobile');
  await service.logout(id, a.sessionId);
  await expect(service.authenticate(a.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  const b = await service.issue(id, 'web');
  await connection.db.update(users).set({ accountStatus: 'suspended' }).where(eq(users.id, id));
  await expect(service.authenticate(b.accessToken)).rejects.toMatchObject({
    code: 'ACCOUNT_SUSPENDED',
  });
});
it('SEC: failed rotation transaction rolls back replacement and old-session changes together', async () => {
  const id = await identity();
  const a = await service.issue(id, 'mobile');
  await expect(
    repository.transaction(id, async (transaction) => {
      const [previous] = await transaction.list();
      if (!previous) throw new Error('Missing persisted session');
      await transaction.rotate(
        previous.id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          refreshTokenHash: 'rollback-fixture',
          client: 'mobile',
          createdAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + 1000),
        },
        now,
      );
      throw new Error('Deliberate rollback');
    }),
  ).rejects.toThrow('Deliberate rollback');
  expect(await service.authenticate(a.accessToken)).toMatchObject({ userId: id });
  const rows = await connection.db.select().from(sessions).where(eq(sessions.userId, id));
  expect(rows).toHaveLength(1);
});

it('SEC: real HTTP refresh reuse invalidates the replacement before its next protected call', async () => {
  const id = await identity();
  const a = await service.issue(id, 'mobile');
  const server = application.getHttpAdapter().getInstance();
  const refresh = (refreshToken: string) =>
    server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
  const response = await refresh(a.refreshToken);
  expect(response.statusCode).toBe(200);
  const b = response.json<{ accessToken: string; refreshToken: string }>();
  expect((await refresh(a.refreshToken)).statusCode).toBe(401);
  expect((await refresh(b.refreshToken)).statusCode).toBe(401);
  const logout = await server.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: { authorization: 'Bearer ' + b.accessToken },
  });
  expect(logout.statusCode).toBe(401);
  expect(logout.json().code).toBe('SESSION_REVOKED');
});
it('SEC: real HTTP cookie refresh enforces CSRF and logout immediately revokes persisted access', async () => {
  const id = await identity();
  const a = await service.issue(id, 'web');
  const server = application.getHttpAdapter().getInstance();
  const csrf = crypto.digest(a.refreshToken, 'csrf');
  const cookie = 'hsm_refresh=' + a.refreshToken + '; hsm_csrf=' + csrf;
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: {},
        headers: { cookie },
      })
    ).statusCode,
  ).toBe(403);
  const response = await server.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: {},
    headers: { cookie, 'x-csrf-token': csrf },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).not.toHaveProperty('refreshToken');
  const cookies = response.cookies
    .map((value: { name: string; value: string }) => value.name + '=' + value.value)
    .join('; ');
  const nextCsrf = response.cookies.find(
    (value: { name: string }) => value.name === 'hsm_csrf',
  )?.value;
  const headers = { cookie: cookies, 'x-csrf-token': nextCsrf };
  const logout = await server.inject({ method: 'POST', url: '/v1/auth/logout', headers });
  expect(logout.statusCode).toBe(200);
  expect(
    (await server.inject({ method: 'POST', url: '/v1/auth/logout', headers })).statusCode,
  ).toBe(401);
});

async function otpFixture() {
  const email = randomBytes(12).toString('hex') + '@example.com';
  const [user] = await connection.db
    .insert(users)
    .values({ fullName: 'OTP integration', email })
    .returning();
  if (!user) throw new Error('Missing OTP identity');
  const repository = new OtpRepository(connection.db);
  const otp = new OtpService(repository, crypto, () => now);
  return { email, user, otp, repository };
}
async function outboxCode(userId: string) {
  const rows = await connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientUserId, userId));
  const message = rows.at(-1);
  const envelope = z.string().parse(message?.payload.envelope);
  return z
    .object({ code: z.string() })
    .parse(JSON.parse(crypto.decrypt(Buffer.from(envelope, 'base64'), 'email'))).code;
}
it('AUTH-C-002: real OTP attempts, cooldown, purpose, expiry and one-time consumption persist', async () => {
  const { email, user, otp } = await otpFixture();
  await otp.request(email, 'signup_verify');
  const code = await outboxCode(user.id);
  await otp.request(email, 'signup_verify');
  let rows = await connection.db.select().from(emailOtps).where(eq(emailOtps.userId, user.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.codeHash).toMatch(/^[a-f0-9]{64}$/);
  expect(rows[0]?.codeHash).not.toBe(code);
  await expect(otp.resetPassword(email, code, 'hash')).rejects.toThrow();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++)
    await expect(otp.verifyEmail(email, wrong)).rejects.toThrow();
  await expect(otp.verifyEmail(email, code)).rejects.toThrow();
  rows = await connection.db.select().from(emailOtps).where(eq(emailOtps.userId, user.id));
  expect(rows[0]?.attempts).toBe(5);
  await connection.db
    .update(emailOtps)
    .set({ attempts: 0, expiresAt: now })
    .where(eq(emailOtps.userId, user.id));
  await expect(otp.verifyEmail(email, code)).rejects.toThrow();
  await connection.db
    .update(emailOtps)
    .set({ expiresAt: new Date(now.getTime() + 1000) })
    .where(eq(emailOtps.userId, user.id));
  const results = await Promise.allSettled([
    otp.verifyEmail(email, code),
    otp.verifyEmail(email, code),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  await expect(otp.verifyEmail(email, code)).rejects.toThrow();
  const [verified] = await connection.db.select().from(users).where(eq(users.id, user.id));
  expect(verified?.emailVerifiedAt).toEqual(now);
});
it('SEC: real password reset consumes OTP and revokes every device in one transaction', async () => {
  const { email, user, otp } = await otpFixture();
  // Recovery requires an existing verified permanent identity, unlike staged signup.
  await connection.db
    .update(users)
    .set({ emailVerifiedAt: now, passwordHash: 'existing-protected-password-hash' })
    .where(eq(users.id, user.id));
  const a = await service.issue(user.id, 'mobile');
  const b = await service.issue(user.id, 'web');
  await otp.request(email, 'password_reset');
  const code = await outboxCode(user.id);
  await expect(
    otp.verify(email, code, 'password_reset', async (transaction, time) => {
      await transaction.resetPassword('rollback-hash', time);
      throw new Error('Deliberate password reset rollback');
    }),
  ).rejects.toThrow('Deliberate');
  expect(await service.authenticate(a.accessToken)).toMatchObject({ userId: user.id });
  await otp.resetPassword(email, code, 'protected-password-hash');
  for (const credential of [a, b])
    await expect(service.authenticate(credential.accessToken)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  await expect(otp.resetPassword(email, code, 'other')).rejects.toThrow();
  const [updated] = await connection.db.select().from(users).where(eq(users.id, user.id));
  expect(updated?.passwordHash).toBe('protected-password-hash');
});
it('SEC: a failed outbox insert rolls back OTP issuance instead of stranding an undeliverable code', async () => {
  const { email, user, otp, repository } = await otpFixture();
  await otp.request(email, 'signup_verify');
  const [message] = await connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientUserId, user.id));
  if (!message) throw new Error('Missing outbox fixture');
  await expect(
    repository.transaction(email, (transaction) =>
      transaction.issue(
        {
          userId: user.id,
          email,
          purpose: 'password_reset',
          codeHash: 'digest',
          expiresAt: now,
        },
        { eventType: 'auth.otp', channel: 'email', payload: {}, dedupeKey: message.dedupeKey },
      ),
    ),
  ).rejects.toThrow();
  const rows = await connection.db.select().from(emailOtps).where(eq(emailOtps.userId, user.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.purpose).toBe('signup_verify');
});
