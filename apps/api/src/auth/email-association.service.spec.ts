import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { emailOtps, notificationOutbox } from '@hsm/db';
import { AuthCrypto, verifyPassword } from './crypto.js';
import { testKeys } from '../../test/keys.js';
import { EmailAssociationService } from './email-association.service.js';
import type {
  EmailAssociationStore,
  EmailAssociationTransaction,
} from './email-association.store.js';
import { OtpService } from './otp.service.js';
import type { OtpIdentity, OtpRecord, OtpStore } from './otp.store.js';
vi.mock('./crypto.js', async (original) => ({
  ...(await original<typeof import('./crypto.js')>()),
  verifyPassword: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  email = 'manager@example.test';
const crypto = new AuthCrypto(testKeys());
let now: Date, identity: OtpIdentity | undefined, row: OtpRecord | undefined;
let messages: (typeof notificationOutbox.$inferInsert)[];
const profile = () => ({
  user: { id: actor.userId, fullName: 'Manager', email, emailVerified: true, cnicLast4: null },
  capabilities: {
    customer: false,
    owner: false,
    managerOf: [{ branchId: randomUUID(), branchName: 'Original branch' }],
    admin: null,
  },
});
let fresh: ReturnType<typeof profile>;
const profiles = { read: vi.fn() };
const transaction: EmailAssociationTransaction = {
  get identity() {
    return identity;
  },
  managerAllowed: vi.fn(),
  emailAvailable: vi.fn(),
  latest: vi.fn(),
  attempt: vi.fn(),
  consume: vi.fn(),
  bindEmail: vi.fn(),
  verifyEmail: vi.fn(),
  resetPassword: vi.fn(),
  issue: vi.fn(
    async (
      input: typeof emailOtps.$inferInsert,
      message: typeof notificationOutbox.$inferInsert,
    ) => {
      row = {
        id: input.id ?? randomUUID(),
        userId: input.userId ?? null,
        email: input.email,
        purpose: input.purpose,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt ?? now,
        requestIp: null,
        attempts: 0,
        consumedAt: null,
      };
      messages.push(message);
    },
  ),
};
const dispatch = vi.fn();
const store: EmailAssociationStore = {
  async transaction(actor, work) {
    dispatch(actor, work);
    return work(transaction);
  },
};
const otp = new OtpService({ transaction: vi.fn() } as OtpStore, crypto, () => now);
const service = new EmailAssociationService(store, otp, profiles, () => now);
beforeEach(() => {
  vi.clearAllMocks();
  now = new Date('2026-10-12T12:00:00Z');
  row = undefined;
  messages = [];
  identity = {
    id: actor.userId,
    email: null,
    emailVerifiedAt: null,
    passwordHash: 'permanent-hash',
    accountStatus: 'active',
  };
  fresh = profile();
  vi.mocked(verifyPassword).mockResolvedValue(true);
  profiles.read.mockImplementation(async () => fresh);
  vi.mocked(transaction.managerAllowed).mockResolvedValue(true);
  vi.mocked(transaction.emailAvailable).mockResolvedValue(true);
  vi.mocked(transaction.latest).mockImplementation(async () => row);
  vi.mocked(transaction.attempt).mockImplementation(async (_id, attempts) => {
    if (row) row.attempts = attempts;
  });
  vi.mocked(transaction.consume).mockImplementation(async (_id, at) => {
    if (row) row.consumedAt = at;
  });
  vi.mocked(transaction.bindEmail).mockImplementation(async (target, at) => {
    if (identity) {
      identity.email = target;
      identity.emailVerifiedAt = at;
    }
  });
});
async function request() {
  return service.request(actor, { email, currentPassword: 'Permanent password phrase' });
}
function code() {
  const envelope = z.object({ envelope: z.string() }).parse(messages.at(-1)?.payload).envelope;
  return z
    .object({ code: z.string() })
    .parse(JSON.parse(crypto.decrypt(Buffer.from(envelope, 'base64'), 'email').toString())).code;
}
it('AUTH-M CHG-006: association reauthenticates the live identity and queues purpose-separated OTP without binding email early', async () => {
  expect(await request()).toEqual({ accepted: true });
  expect(dispatch).toHaveBeenCalledWith(actor, expect.any(Function));
  expect(verifyPassword).toHaveBeenCalledWith('permanent-hash', 'Permanent password phrase');
  expect(row).toMatchObject({ userId: actor.userId, email, purpose: 'email_change', attempts: 0 });
  expect(identity?.email).toBeNull();
  expect(identity?.emailVerifiedAt).toBeNull();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
  expect(profiles.read).not.toHaveBeenCalled();
  expect(messages[0]?.recipientAddress).toBe(email);
  expect(messages[0]?.payload).not.toHaveProperty('code');
  expect(otp.matches(actor.userId, 'signup_verify', code(), row?.codeHash ?? '')).toBe(false);
});
it('AUTH-M SEC: persisted resend cooldown limits new association delivery and a later request rotates the challenge', async () => {
  await request();
  const first = row?.id;
  await request();
  expect(messages).toHaveLength(1);
  now = new Date(now.getTime() + 60000);
  await request();
  expect(messages).toHaveLength(2);
  expect(row?.id).not.toBe(first);
});
it('SEC: wrong permanent password cannot issue an association code', async () => {
  vi.mocked(verifyPassword).mockResolvedValue(false);
  await expect(request()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(messages).toHaveLength(0);
});
it('SEC: a claimed target email has the same acknowledgement without creating or merging an identity', async () => {
  vi.mocked(transaction.emailAvailable).mockResolvedValue(false);
  expect(await request()).toEqual({ accepted: true });
  expect(messages).toHaveLength(0);
  expect(identity?.email).toBeNull();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
});
it.each([
  'missing',
  'suspended',
  'passwordless',
  'existing-email',
  'verified',
  'lost-manager',
] as const)('SEC: %s identity cannot start or verify email association', async (kind) => {
  if (kind === 'missing') identity = undefined;
  else if (identity) {
    if (kind === 'suspended') identity.accountStatus = 'suspended';
    if (kind === 'passwordless') identity.passwordHash = null;
    if (kind === 'existing-email') identity.email = 'existing@example.test';
    if (kind === 'verified') identity.emailVerifiedAt = now;
  }
  if (kind === 'lost-manager') vi.mocked(transaction.managerAllowed).mockResolvedValue(false);
  await expect(request()).rejects.toBeDefined();
  await expect(service.verify(actor, { email, code: '123456' })).rejects.toBeDefined();
  expect(messages).toHaveLength(0);
  expect(transaction.attempt).not.toHaveBeenCalled();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
});
it('AUTH-M SEC: valid proof binds email once on the original identity, retaining its Manager capabilities and permanent password', async () => {
  await request();
  const proof = code();
  expect(await service.verify(actor, { email, code: proof })).toEqual(fresh);
  expect(transaction.attempt).toHaveBeenCalledWith(row?.id, 1);
  expect(transaction.consume).toHaveBeenCalledWith(row?.id, now);
  expect(transaction.bindEmail).toHaveBeenCalledWith(email, now);
  expect(identity).toMatchObject({
    id: actor.userId,
    email,
    emailVerifiedAt: now,
    passwordHash: 'permanent-hash',
  });
  expect(profiles.read).toHaveBeenCalledWith(actor.userId);
  await expect(service.verify(actor, { email, code: proof })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});
it('SEC: incorrect proofs commit five attempts, then lock without consuming or binding', async () => {
  await request();
  const wrong = code() === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 6; attempt++)
    await expect(service.verify(actor, { email, code: wrong })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  expect(row?.attempts).toBe(5);
  expect(transaction.attempt).toHaveBeenCalledTimes(5);
  expect(transaction.consume).not.toHaveBeenCalled();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
});
it.each([
  'missing',
  'expired',
  'consumed',
  'locked',
  'wrong-user',
  'wrong-email',
  'wrong-purpose',
] as const)('SEC: %s challenge cannot authorize association', async (kind) => {
  await request();
  const proof = code();
  if (kind === 'missing') row = undefined;
  else if (row) {
    if (kind === 'expired') row.expiresAt = now;
    if (kind === 'consumed') row.consumedAt = now;
    if (kind === 'locked') row.attempts = 5;
    if (kind === 'wrong-user') row.userId = randomUUID();
    if (kind === 'wrong-email') row.email = 'other@example.test';
    if (kind === 'wrong-purpose') row.purpose = 'signup_verify';
  }
  await expect(service.verify(actor, { email, code: proof })).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(transaction.attempt).not.toHaveBeenCalled();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
});
it('SEC: target email claimed after issuance commits the attempt and never consumes or merges', async () => {
  await request();
  vi.mocked(transaction.emailAvailable).mockResolvedValue(false);
  await expect(service.verify(actor, { email, code: code() })).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(row?.attempts).toBe(1);
  expect(transaction.consume).not.toHaveBeenCalled();
  expect(transaction.bindEmail).not.toHaveBeenCalled();
});
it.each(['foreign-user', 'foreign-email', 'unverified'] as const)(
  'SEC: %s fresh projection cannot be returned as association success',
  async (kind) => {
    await request();
    if (kind === 'foreign-user') fresh.user.id = randomUUID();
    if (kind === 'foreign-email') fresh.user.email = 'foreign@example.test';
    if (kind === 'unverified') fresh.user.emailVerified = false;
    await expect(service.verify(actor, { email, code: code() })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  },
);
it('SEC: invalid caller fields are rejected before transaction dispatch', async () => {
  await expect(
    service.request(actor, {
      email,
      currentPassword: 'Permanent password phrase',
      userId: randomUUID(),
    } as Parameters<typeof service.request>[1]),
  ).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
});
