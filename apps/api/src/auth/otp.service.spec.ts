import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthCrypto } from './crypto.js';
import { OtpService } from './otp.service.js';
import type { OtpIdentity, OtpRecord, OtpStore, OtpTransaction } from './otp.store.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let now: Date;
let identity: OtpIdentity | undefined;
let rows: OtpRecord[];
let messages: Parameters<OtpTransaction['issue']>[1][];
const verifyEmail = vi.fn();
const resetPassword = vi.fn();
const store: OtpStore = {
  transaction: async (_email, work) =>
    work({
      identity,
      latest: async (purpose) => rows.filter((row) => row.purpose === purpose).at(-1),
      issue: async (row, message) => {
        rows.push({
          ...row,
          id: row.id ?? randomUUID(),
          userId: row.userId ?? null,
          attempts: 0,
          consumedAt: null,
          requestIp: null,
          createdAt: now,
        } as OtpRecord);
        messages.push(message);
      },
      attempt: async (id, attempts) => {
        const row = rows.find((value) => value.id === id);
        if (row) row.attempts = attempts;
      },
      consume: async (id, consumedAt) => {
        const row = rows.find((value) => value.id === id);
        if (row) row.consumedAt = consumedAt;
      },
      verifyEmail,
      resetPassword,
    }),
};
const service = new OtpService(store, crypto, () => now);
beforeEach(() => {
  now = new Date('2026-10-07T12:00:00Z');
  identity = {
    id: randomUUID(),
    email: 'otp@example.com',
    emailVerifiedAt: null,
    accountStatus: 'active',
    passwordHash: 'permanent-hash',
  };
  rows = [];
  messages = [];
  vi.clearAllMocks();
});
function deliveredCode() {
  const message = messages.at(-1);
  if (!message || typeof message.payload.envelope !== 'string') throw new Error('Missing outbox');
  return JSON.parse(crypto.decrypt(Buffer.from(message.payload.envelope, 'base64'), 'email')) as {
    code: string;
  };
}
it('AUTH-C-002: issuance stores only a bound digest and encrypted outbox, with a 60-second cooldown', async () => {
  await service.request('otp@example.com', 'signup_verify');
  const code = deliveredCode().code;
  expect(code).toMatch(/^[0-9]{6}$/);
  expect(rows[0]?.codeHash).not.toBe(code);
  expect(JSON.stringify(messages)).not.toContain('"code"');
  expect(rows[0]?.expiresAt.getTime()).toBe(now.getTime() + 600000);
  await service.request('otp@example.com', 'signup_verify');
  expect(rows).toHaveLength(1);
  now = new Date(now.getTime() + 60000);
  await service.request('otp@example.com', 'signup_verify');
  expect(rows).toHaveLength(2);
});
it('SEC: correct OTP succeeds once and cannot be replayed or used for another purpose', async () => {
  await service.request('otp@example.com', 'signup_verify');
  const code = deliveredCode().code;
  await expect(service.resetPassword('otp@example.com', code, 'hash')).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(await service.verifyEmail('otp@example.com', code)).toBe(identity?.id);
  expect(verifyEmail).toHaveBeenCalledWith(now);
  await expect(service.verifyEmail('otp@example.com', code)).rejects.toThrow();
  expect(rows[0]?.consumedAt).toEqual(now);
  expect(rows[0]?.attempts).toBe(1);
});
it('SEC: wrong attempts persist and the sixth attempt is blocked even with the correct code', async () => {
  await service.request('otp@example.com', 'signup_verify');
  const code = deliveredCode().code;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++)
    await expect(service.verifyEmail('otp@example.com', wrong)).rejects.toThrow();
  expect(rows[0]?.attempts).toBe(5);
  await expect(service.verifyEmail('otp@example.com', code)).rejects.toThrow();
  expect(verifyEmail).not.toHaveBeenCalled();
});
it('SEC: expiry is inclusive and password-reset success delegates the atomic mutation', async () => {
  if (!identity) throw new Error('Missing identity fixture');
  identity = { ...identity, emailVerifiedAt: now };
  await service.request('otp@example.com', 'password_reset');
  const code = deliveredCode().code;
  expect(await service.resetPassword('otp@example.com', code, 'protected-hash')).toBe(identity?.id);
  expect(resetPassword).toHaveBeenCalledWith('protected-hash', now);
  now = new Date(now.getTime() + 60000);
  await service.request('otp@example.com', 'password_reset');
  const later = deliveredCode().code;
  now = new Date(now.getTime() + 600000);
  await expect(service.resetPassword('otp@example.com', later, 'hash')).rejects.toThrow();
});
it('SEC: missing/inactive identities and verified resend acknowledge without issuing a code', async () => {
  const active = identity;
  identity = undefined;
  await service.request('missing@example.com', 'signup_verify');
  await expect(service.verifyEmail('missing@example.com', '123456')).rejects.toThrow();
  if (!active) throw new Error('Missing identity fixture');
  identity = { ...active, accountStatus: 'suspended' };
  await service.request('otp@example.com', 'password_reset');
  await expect(service.verifyEmail('otp@example.com', '123456')).rejects.toThrow();
  identity = { ...active, email: null };
  await service.request('otp@example.com', 'signup_verify');
  identity = { ...active, emailVerifiedAt: now };
  await service.request('otp@example.com', 'signup_verify');
  expect(rows).toHaveLength(0);
  await expect(service.verifyEmail('otp@example.com', '123456')).rejects.toThrow();
});

it('AUTH-C / CHG-006: verified passwordless registration can request a replacement signup OTP', async () => {
  if (!identity) throw new Error('Missing identity fixture');
  identity = { ...identity, emailVerifiedAt: now, passwordHash: null };
  await service.request('otp@example.com', 'signup_verify');
  expect(rows).toHaveLength(1);
});
it.each(['passwordless', 'unverified'] as const)(
  'SEC / CHG-006: %s identity cannot use recovery to bypass permanent password setup',
  async (state) => {
    if (!identity) throw new Error('Missing identity fixture');
    identity = { ...identity, emailVerifiedAt: now, passwordHash: 'permanent-hash' };
    await service.request('otp@example.com', 'password_reset');
    const code = deliveredCode().code;
    identity = {
      ...identity,
      emailVerifiedAt: state === 'unverified' ? null : now,
      passwordHash: state === 'passwordless' ? null : 'permanent-hash',
    };
    await expect(
      service.resetPassword('otp@example.com', code, 'replacement-hash'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(resetPassword).not.toHaveBeenCalled();
    now = new Date(now.getTime() + 60000);
    await service.request('otp@example.com', 'password_reset');
    expect(rows).toHaveLength(1);
  },
);

it('SEC: existing signup and recovery cannot override the identity email destination', async () => {
  for (const purpose of ['signup_verify', 'password_reset'] as const)
    await expect(
      store.transaction('otp@example.com', (tx) =>
        service.issue(tx, purpose, now, 'foreign@example.test'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(rows).toHaveLength(0);
  expect(messages).toHaveLength(0);
});
