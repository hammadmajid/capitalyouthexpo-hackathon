import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AuthCrypto, hashPassword, verifyPassword } from './crypto.js';
import { SessionService } from './session.service.js';
import type { SessionRecord, SessionTransaction, SessionStore } from './session.store.js';
vi.setConfig({ testTimeout: 30000 });
const userId = randomUUID();
const currentId = randomUUID();
const otherId = randomUUID();
const now = new Date('2026-10-07T12:00:00Z');
const password = 'Original password change phrase';
const replacement = 'Replacement password change phrase';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let hash: string;
let identity: SessionTransaction['identity'];
let rows: SessionRecord[];
const setPassword = vi.fn();
const revoke = vi.fn();
const store: SessionStore = {
  identify: async () => undefined,
  transaction: async (_id, work) =>
    work({
      identity,
      list: async () => rows,
      setPassword,
      revoke,
      insert: async () => undefined,
      rotate: async () => undefined,
    }),
};
const service = new SessionService(store, crypto, () => now);
beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(() => {
  vi.clearAllMocks();
  identity = { id: userId, accountStatus: 'active', passwordHash: hash };
  rows = [currentId, otherId].map((id) => ({
    id,
    userId,
    refreshTokenHash: id,
    client: 'mobile',
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + 60000),
    deviceLabel: null,
    ip: null,
    userAgent: null,
    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,
  }));
});
it('SEC: password change preserves current session and revokes other devices atomically', async () => {
  await service.changePassword(userId, currentId, password, replacement);
  const updatedHash = setPassword.mock.calls[0]?.[0] as string;
  expect(updatedHash).not.toBe(replacement);
  expect(await verifyPassword(updatedHash, replacement)).toBe(true);
  expect(setPassword).toHaveBeenCalledWith(updatedHash, now);
  expect(revoke).toHaveBeenCalledWith([otherId], 'password_change', now);
});
it('SEC: wrong or absent current password cannot modify credentials or revoke devices', async () => {
  await expect(
    service.changePassword(userId, currentId, 'Incorrect password', replacement),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  identity = { id: userId, accountStatus: 'active', passwordHash: null };
  await expect(
    service.changePassword(userId, currentId, password, replacement),
  ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(setPassword).not.toHaveBeenCalled();
  expect(revoke).not.toHaveBeenCalled();
});
it('SEC: revoked sessions, missing identities and suspended accounts cannot change passwords', async () => {
  const row = rows[0];
  if (!row) throw new Error('Missing session fixture');
  row.revokedAt = now;
  await expect(
    service.changePassword(userId, currentId, password, replacement),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  identity = undefined;
  await expect(
    service.changePassword(userId, currentId, password, replacement),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  identity = { id: userId, accountStatus: 'suspended', passwordHash: hash };
  await expect(
    service.changePassword(userId, currentId, password, replacement),
  ).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  expect(setPassword).not.toHaveBeenCalled();
});
it('SEC: a password update failure cannot proceed to session revocation', async () => {
  setPassword.mockRejectedValueOnce(new Error('Database write failed'));
  await expect(service.changePassword(userId, currentId, password, replacement)).rejects.toThrow(
    'Database write failed',
  );
  expect(revoke).not.toHaveBeenCalled();
});
