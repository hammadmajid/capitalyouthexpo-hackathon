import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { AuthCrypto, verifyPassword } from './crypto.js';
import { RegistrationService } from './registration.service.js';
import type { RegistrationStore } from './registration.store.js';
import type { OtpIdentity, OtpRecord, OtpTransaction } from './otp.store.js';
import type { SessionIdentity } from './session.store.js';
vi.setConfig({ testTimeout: 30000 });
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const now = new Date('2026-10-10T12:00:00Z'),
  userId = randomUUID();
const email = 'pending@example.test',
  code = '345671',
  password = 'A distinct registration password phrase';
let identity: OtpIdentity;
let locked: SessionIdentity;
let row: OtpRecord;
let transaction: OtpTransaction;
let store: RegistrationStore;
let service: RegistrationService;
const profiles = { read: vi.fn() };
const sessions = { issue: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  identity = {
    id: userId,
    email,
    emailVerifiedAt: null,
    passwordHash: null,
    accountStatus: 'active',
  };
  locked = { id: userId, passwordHash: null, emailVerifiedAt: now, accountStatus: 'active' };
  row = {
    id: randomUUID(),
    userId,
    email,
    purpose: 'signup_verify',
    codeHash: crypto.digest('signup_verify:' + userId + ':' + code, 'otp'),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 600000),
    consumedAt: null,
    requestIp: null,
  };
  transaction = {
    identity,
    latest: vi.fn(async () => row),
    issue: vi.fn(async () => undefined),
    attempt: vi.fn(async (_id, attempts) => {
      row.attempts = attempts;
    }),
    consume: vi.fn(async (_id, date) => {
      row.consumedAt = date;
    }),
    verifyEmail: vi.fn(async (date) => {
      identity.emailVerifiedAt = date;
    }),
    resetPassword: vi.fn(),
  };
  store = {
    start: vi.fn(async (_email, _date, work) => work(transaction)),
    transaction: async (_email, work) => work(transaction),
    grant: vi.fn(async () => 'password' as const),
    complete: vi.fn(async (_token, hash) => {
      locked.passwordHash = hash;
      return userId;
    }),
  };
  profiles.read.mockResolvedValue({
    user: { id: userId, fullName: '', email, emailVerified: true, cnicLast4: null },
    capabilities: { customer: false, owner: false, managerOf: [], admin: null },
  });
  sessions.issue.mockImplementation(
    async (_id: string, client: 'web' | 'mobile', validate?: (value: SessionIdentity) => void) => {
      validate?.(locked);
      return {
        accessToken: 'private-access',
        refreshToken: 'private-refresh',
        sessionId: randomUUID(),
        expiresIn: 600,
        client,
      };
    },
  );
  service = new RegistrationService(store, crypto, sessions, profiles, () => now);
});
it('AUTH-C / CHG-006: email-first start delegates issuance inside the pending-identity transaction without a session', async () => {
  row.createdAt = new Date(now.getTime() - 60000);
  expect(await service.start({ email: 'PENDING@EXAMPLE.TEST' })).toEqual({
    verificationRequired: true,
  });
  expect(store.start).toHaveBeenCalledWith(email, now, expect.any(Function));
  const message = vi.mocked(transaction.issue).mock.calls[0]?.[1];
  expect(typeof message?.payload.envelope).toBe('string');
  expect(message).not.toHaveProperty('code');
  expect(sessions.issue).not.toHaveBeenCalled();
});
it('AUTH-C / CHG-006: valid OTP consumes proof and creates only a purpose-separated password grant', async () => {
  const result = await service.verify({ email, code });
  expect(result).toMatchObject({ next: 'password', expiresIn: 600 });
  if (result.next !== 'password') throw new Error('Missing grant');
  expect(result.setupToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(store.grant).toHaveBeenCalledWith(
    transaction,
    crypto.digest('registration-password:' + result.setupToken, 'otp'),
    now,
  );
  expect(vi.mocked(store.grant).mock.calls[0]?.[1]).not.toBe(result.setupToken);
  expect(transaction.verifyEmail).toHaveBeenCalledWith(now);
  expect(row.consumedAt).toEqual(now);
  expect(sessions.issue).not.toHaveBeenCalled();
  expect(result).not.toHaveProperty('accessToken');
  await expect(service.verify({ email, code })).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(store.grant).toHaveBeenCalledTimes(1);
});
it('SEC: wrong OTP attempts cannot create grants or sessions and retain the existing attempt bound', async () => {
  for (let index = 0; index < 5; index++)
    await expect(service.verify({ email, code: '000000' })).rejects.toThrow();
  expect(row.attempts).toBe(5);
  await expect(service.verify({ email, code })).rejects.toThrow();
  expect(store.grant).not.toHaveBeenCalled();
  expect(sessions.issue).not.toHaveBeenCalled();
});
it('SEC: missing and inactive identities cannot mint setup grants', async () => {
  transaction = { ...transaction, identity: undefined };
  await expect(service.verify({ email, code })).rejects.toThrow();
  transaction = { ...transaction, identity: { ...identity, accountStatus: 'suspended' } };
  await expect(service.verify({ email, code })).rejects.toThrow();
  expect(store.grant).not.toHaveBeenCalled();
});
it('SEC: existing permanent identity receives only login continuation and its credential is preserved', async () => {
  identity.passwordHash = 'existing-permanent-hash';
  vi.mocked(store.grant).mockResolvedValue('login');
  expect(await service.verify({ email, code })).toEqual({ next: 'login' });
  expect(identity.passwordHash).toBe('existing-permanent-hash');
  expect(store.complete).not.toHaveBeenCalled();
  expect(sessions.issue).not.toHaveBeenCalled();
});
it('AUTH-C: verified pending identity gets a replacement grant without duplicate verification notice', async () => {
  identity.emailVerifiedAt = now;
  expect(await service.verify({ email, code })).toMatchObject({ next: 'password' });
  expect(transaction.verifyEmail).not.toHaveBeenCalled();
  expect(store.grant).toHaveBeenCalledTimes(1);
});
it('AUTH-C: permanent password is hashed and setup consumed before issuing a live-validated session', async () => {
  const result = await service.password({ setupToken: 'a'.repeat(43), password, client: 'mobile' });
  const complete = vi.mocked(store.complete).mock.calls[0];
  expect(complete?.[0]).toBe(crypto.digest('registration-password:' + 'a'.repeat(43), 'otp'));
  expect(await verifyPassword(complete?.[1] ?? null, password)).toBe(true);
  expect(sessions.issue).toHaveBeenCalledWith(userId, 'mobile', expect.any(Function));
  expect(vi.mocked(store.complete).mock.invocationCallOrder[0]).toBeLessThan(
    sessions.issue.mock.invocationCallOrder[0] ?? 0,
  );
  expect(result).toMatchObject({
    client: 'mobile',
    capabilities: { customer: false, owner: false },
  });
});
it('SEC: rejected setup cannot issue credentials or read a profile', async () => {
  vi.mocked(store.complete).mockRejectedValue(
    new DomainError('INVALID_CREDENTIALS', 401, 'Registration setup unavailable'),
  );
  await expect(
    service.password({ setupToken: 'a'.repeat(43), password, client: 'web' }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(sessions.issue).not.toHaveBeenCalled();
  expect(profiles.read).not.toHaveBeenCalled();
});
it.each(['password', 'verification'] as const)(
  'SEC: concurrent %s change defeats stale session issuance after setup',
  async (kind) => {
    sessions.issue.mockImplementationOnce(
      async (_id: string, _client: string, validate: (value: SessionIdentity) => void) => {
        validate({
          ...locked,
          ...(kind === 'password' ? { passwordHash: 'changed' } : { emailVerifiedAt: null }),
        });
        throw new Error('Unsafe session continuation');
      },
    );
    await expect(
      service.password({ setupToken: 'a'.repeat(43), password, client: 'web' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(profiles.read).not.toHaveBeenCalled();
  },
);
it('SEC: old signup fields, invalid OTP and incomplete setup are rejected at service boundaries', async () => {
  await expect(
    service.start({ email, fullName: 'Unexpected' } as { email: string }),
  ).rejects.toThrow();
  await expect(service.verify({ email, code: '123' })).rejects.toThrow();
  await expect(service.password({ setupToken: 'a', password, client: 'web' })).rejects.toThrow();
  expect(store.start).not.toHaveBeenCalled();
  expect(store.grant).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
});
it('NTF-002: outbox and grant failures propagate rather than returning setup credentials', async () => {
  row.createdAt = new Date(now.getTime() - 60000);
  vi.mocked(transaction.issue).mockRejectedValueOnce(new Error('Outbox unavailable'));
  await expect(service.start({ email })).rejects.toThrow('Outbox unavailable');
  vi.mocked(store.grant).mockRejectedValueOnce(new Error('Grant unavailable'));
  await expect(service.verify({ email, code })).rejects.toThrow('Grant unavailable');
  expect(sessions.issue).not.toHaveBeenCalled();
});
