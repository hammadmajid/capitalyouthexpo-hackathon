import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { SessionIdentity } from './session.store.js';
import type { OtpTransaction } from './otp.store.js';
import type { SessionService } from './session.service.js';
import type { OtpService } from './otp.service.js';
import { AuthCrypto, hashPassword, verifyPassword } from './crypto.js';
import { IdentityService } from './identity.service.js';
import type { LoginIdentity } from './identity.store.js';
vi.setConfig({ testTimeout: 30000 });
const now = new Date('2026-10-07T20:00:00Z'); // Already October 8 in Pakistan.
const userId = randomUUID();
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const password = 'A distinct secure password';
let hash: string;
let locked: LoginIdentity & Pick<SessionIdentity, 'managerActive'>;
const store = { find: vi.fn(), register: vi.fn() };
const otp = { issue: vi.fn(), verifyEmail: vi.fn(), resetPassword: vi.fn() };
const profiles = { read: vi.fn().mockResolvedValue({ user: {}, capabilities: {} }) };
const sessions = {
  issue: vi.fn(
    async (_id: string, _client: string, validate?: (value: SessionIdentity) => void) => {
      validate?.(locked);
      return { accessToken: 'credential' };
    },
  ),
};
let service: IdentityService;
const registration = {
  fullName: 'Identity Test',
  email: 'identity@example.com',
  phone: '+923001234567',
  password,
  gender: 'male' as const,
  dateOfBirth: '2008-10-08',
  cnic: '3520212345671',
};
beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(() => {
  vi.clearAllMocks();
  locked = { id: userId, accountStatus: 'active', passwordHash: hash, emailVerifiedAt: now };
  store.find.mockResolvedValue(locked);
  store.register.mockImplementation(
    async (_row: unknown, work: (transaction: OtpTransaction) => Promise<void>) =>
      work({} as OtpTransaction),
  );
  service = new IdentityService(
    store,
    sessions as unknown as SessionService,
    otp as unknown as OtpService,
    crypto,
    profiles,
    hash,
    () => now,
  );
});
it('AUTH-C-003: exact local eighteenth birthday registers protected identity and transactional OTP', async () => {
  expect(await service.register(registration)).toEqual({ verificationRequired: true });
  const row = store.register.mock.calls[0]?.[0];
  expect(row).toMatchObject({
    email: registration.email,
    phoneE164: registration.phone,
    cnicLast4: '5671',
  });
  expect(row).not.toHaveProperty('password');
  expect(row).not.toHaveProperty('cnic');
  expect(await verifyPassword(row.passwordHash as string, password)).toBe(true);
  expect(row.cnicEncrypted).not.toEqual(Buffer.from(registration.cnic));
  expect(otp.issue).toHaveBeenCalledWith({}, 'signup_verify', now);
  await expect(
    service.register({ ...registration, dateOfBirth: '2008-10-09' }),
  ).rejects.toMatchObject({ code: 'UNDERAGE' });
});
it('SEC: normalized login verifies password and rechecks credentials under the session lock', async () => {
  expect(
    await service.login({ identifier: ' IDENTITY@EXAMPLE.COM ', password, client: 'mobile' }),
  ).toMatchObject({ accessToken: 'credential' });
  expect(store.find).toHaveBeenCalledWith('identity@example.com');
  expect(sessions.issue).toHaveBeenCalledWith(userId, 'mobile', expect.any(Function));
  locked = { ...locked, passwordHash: 'changed-concurrently' };
  await expect(
    service.login({ identifier: 'identity@example.com', password, client: 'web' }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
});
it('SEC: unknown, passwordless and wrong credentials return the same failure', async () => {
  const login = { identifier: 'unknown@example.com', password, client: 'mobile' as const };
  store.find.mockResolvedValue(undefined);
  await expect(service.login(login)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  store.find.mockResolvedValue({ ...locked, passwordHash: null });
  await expect(service.login(login)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  store.find.mockResolvedValue(locked);
  await expect(
    service.login({ ...login, password: 'wrong secure password' }),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(sessions.issue).not.toHaveBeenCalled();
});
it('SEC: suspended/unverified identities cannot login, including verification revoked during login', async () => {
  const login = { identifier: 'identity@example.com', password, client: 'mobile' as const };
  store.find.mockResolvedValue({ ...locked, accountStatus: 'suspended' } satisfies LoginIdentity);
  await expect(service.login(login)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  locked = { ...locked, emailVerifiedAt: null };
  store.find.mockResolvedValue({ ...locked });
  await expect(service.login(login)).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  store.find.mockResolvedValue({ ...locked, emailVerifiedAt: now });
  locked = { ...locked, emailVerifiedAt: null };
  await expect(service.login(login)).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
});
it('AUTH-C-002: verification issues a session, while reset delegates a protected hash', async () => {
  otp.verifyEmail.mockResolvedValue(userId);
  await service.verifyEmail('identity@example.com', '123456', 'web');
  expect(sessions.issue).toHaveBeenCalledWith(userId, 'web', expect.any(Function));
  expect(await service.resetPassword('identity@example.com', '123456', password)).toEqual({
    reset: true,
  });
  const args = otp.resetPassword.mock.calls[0];
  expect(args?.slice(0, 2)).toEqual(['identity@example.com', '123456']);
  expect(await verifyPassword(args?.[2] as string, password)).toBe(true);
});

it('AUTH-M-005: phone-only manager login requires a live persisted assignment under the identity lock', async () => {
  locked = { ...locked, emailVerifiedAt: null, managerActive: true };
  store.find.mockResolvedValue({ ...locked });
  const login = { identifier: '+923001234567', password, client: 'mobile' as const };
  expect(await service.login(login)).toMatchObject({ accessToken: 'credential' });
  locked = { ...locked, managerActive: false };
  await expect(service.login(login)).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
});

it.each(['03001234567', '923001234567', '+923001234567'])(
  'AUTH-C / CHG-006: canonical phone login lookup for %s',
  async (identifier) => {
    await service.login({ identifier, password, client: 'mobile' });
    expect(store.find).toHaveBeenCalledWith('+923001234567');
    expect(sessions.issue).toHaveBeenCalledWith(userId, 'mobile', expect.any(Function));
  },
);
it('AUTH-C / CHG-006: non-Pakistani phone cannot enter identity lookup', async () => {
  await expect(
    service.login({ identifier: '+13001234567', password, client: 'mobile' }),
  ).rejects.toThrow();
  expect(store.find).not.toHaveBeenCalled();
});

it('SEC / CHG-006: legacy email verification cannot issue a session before permanent password setup', async () => {
  otp.verifyEmail.mockResolvedValue(userId);
  locked = { ...locked, passwordHash: null };
  await expect(
    service.verifyEmail('identity@example.com', '123456', 'mobile'),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(profiles.read).not.toHaveBeenCalled();
});
it('SEC / CHG-006: concurrent email verification revocation prevents legacy session issuance', async () => {
  otp.verifyEmail.mockResolvedValue(userId);
  locked = { ...locked, emailVerifiedAt: null };
  await expect(service.verifyEmail('identity@example.com', '123456', 'web')).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(profiles.read).not.toHaveBeenCalled();
});
