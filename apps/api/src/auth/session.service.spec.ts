import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { AuthCrypto } from './crypto.js';
import { SessionService } from './session.service.js';
import type {
  NewSession,
  SessionRecord,
  SessionStore,
  SessionTransaction,
} from './session.store.js';
const userId = randomUUID();
const now = new Date('2026-10-07T12:00:00Z');
let rows: SessionRecord[];
let identity: SessionTransaction['identity'];
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
function insert(value: NewSession) {
  rows.push({
    ...value,
    userId,
    deviceLabel: null,
    ip: null,
    userAgent: null,
    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,
  });
}
const store: SessionStore = {
  identify: async (hash) => rows.find((row) => row.refreshTokenHash === hash)?.userId,
  transaction: async (_user, work) =>
    work({
      identity,
      list: async () => rows,
      setPassword: async () => undefined,
      insert: async (value) => {
        insert(value);
      },
      rotate: async (id, next, at) => {
        insert(next);
        const previous = rows.find((row) => row.id === id);
        if (!previous) throw new Error('Test fixture missing session');
        Object.assign(previous, {
          revokedAt: at,
          revokedReason: 'rotated',
          replacedBySessionId: next.id,
        });
      },
      revoke: async (ids, reason, at) => {
        for (const row of rows)
          if (ids.includes(row.id)) Object.assign(row, { revokedAt: at, revokedReason: reason });
      },
    }),
};
let service: SessionService;
beforeEach(() => {
  rows = [];
  identity = { id: userId, accountStatus: 'active' };
  service = new SessionService(store, crypto, () => now);
});
it('SEC: persists only hashed refresh secrets and checks access against persisted state', async () => {
  const credential = await service.issue(userId, 'mobile');
  expect(rows).toHaveLength(1);
  expect(rows[0]?.refreshTokenHash).not.toBe(credential.refreshToken);
  expect(await service.authenticate(credential.accessToken)).toEqual({
    userId,
    sessionId: credential.sessionId,
  });
});
it('SEC: rotation preserves client and reuse revokes replacement family only', async () => {
  const first = await service.issue(userId, 'web');
  const unrelated = await service.issue(userId, 'mobile');
  const second = await service.refresh(first.refreshToken);
  expect(second.client).toBe('web');
  const third = await service.refresh(second.refreshToken);
  await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await expect(service.refresh(third.refreshToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await expect(service.authenticate(third.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(await service.authenticate(unrelated.accessToken)).toMatchObject({ userId });
});
it('SEC: logout invalidates current access and refresh immediately', async () => {
  const value = await service.issue(userId, 'mobile');
  await service.logout(userId, value.sessionId);
  await expect(service.authenticate(value.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await expect(service.refresh(value.refreshToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await expect(service.logout(userId, value.sessionId)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
});
it('SEC: logout-all revokes every device', async () => {
  const first = await service.issue(userId, 'mobile');
  const other = await service.issue(userId, 'web');
  await service.logout(userId, first.sessionId, true);
  await expect(service.authenticate(other.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
});
it('SEC: unknown and expired refresh credentials cannot rotate', async () => {
  await expect(service.refresh('unknown')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  const value = await service.issue(userId, 'mobile');
  const first = rows[0];
  if (!first) throw new Error('Missing session');
  first.expiresAt = now;
  await expect(service.refresh(value.refreshToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
});
it('SEC: missing identity and account suspension affect the next request', async () => {
  const value = await service.issue(userId, 'mobile');
  identity = { id: userId, accountStatus: 'suspended' };
  await expect(service.authenticate(value.accessToken)).rejects.toMatchObject({
    code: 'ACCOUNT_SUSPENDED',
  });
  await expect(service.refresh(value.refreshToken)).rejects.toMatchObject({
    code: 'ACCOUNT_SUSPENDED',
  });
  identity = undefined;
  await expect(service.issue(userId, 'mobile')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('SEC: client transport mismatch cannot rotate a persisted credential', async () => {
  const value = await service.issue(userId, 'web');
  await expect(service.refresh(value.refreshToken, 'mobile')).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(await service.authenticate(value.accessToken)).toMatchObject({ userId });
  expect(rows).toHaveLength(1);
  expect((await service.refresh(value.refreshToken, 'web')).client).toBe('web');
});
