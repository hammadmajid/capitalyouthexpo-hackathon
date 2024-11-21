import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from './crypto.js';
import { ManagerService } from './manager.service.js';
import type { ManagerInvitation, ManagerTransaction } from './manager.store.js';
import type { SessionService } from './session.service.js';
import type { SessionIdentity } from './session.store.js';
vi.setConfig({ testTimeout: 30000 });
const now = new Date('2026-10-07T12:00:00Z');
const userId = randomUUID();
const tempPassword = 'Temporary invitation phrase';
const input = {
  phone: '+923001234567',
  tempPassword,
  newPassword: 'Permanent manager password phrase',
  client: 'mobile' as const,
};
let tempHash: string;
let invitation: ManagerInvitation | undefined;
let identity: ManagerTransaction['identity'];
let locked: SessionIdentity;
const attempt = vi.fn(async (count: number, at: Date) => {
  if (invitation)
    Object.assign(invitation, { tempPasswordAttempts: count, lockedAt: count >= 5 ? at : null });
});
const activate = vi.fn(async (hash: string) => {
  locked = { id: userId, accountStatus: 'active', passwordHash: hash, managerActive: true };
  if (invitation) Object.assign(invitation, { status: 'active', tempPasswordHash: null });
});
const store = {
  transaction: async <T>(_phone: string, work: (value: ManagerTransaction) => Promise<T>) =>
    work({ identity, invitation, attempt, activate }),
};
const profiles = { read: vi.fn().mockResolvedValue({ user: { id: userId }, capabilities: {} }) };
const sessions = {
  issue: vi.fn(
    async (_id: string, _client: string, validate?: (value: SessionIdentity) => void) => {
      validate?.(locked);
      return { accessToken: 'credential' };
    },
  ),
};
let service: ManagerService;
beforeAll(async () => {
  tempHash = await hashPassword(tempPassword);
});
beforeEach(() => {
  vi.clearAllMocks();
  identity = { id: userId, accountStatus: 'active', passwordHash: null };
  locked = { id: userId, accountStatus: 'active', managerActive: false };
  invitation = {
    id: randomUUID(),
    userId,
    branchId: randomUUID(),
    appointedByUserId: randomUUID(),
    status: 'pending_activation',
    tempPasswordHash: tempHash,
    tempPasswordExpiresAt: new Date(now.getTime() + 86400000),
    tempPasswordAttempts: 0,
    activatedAt: null,
    suspendedAt: null,
    deactivatedAt: null,
    lockedAt: null,
    statusReason: null,
    createdAt: now,
    updatedAt: now,
  };
  service = new ManagerService(
    store,
    sessions as unknown as SessionService,
    profiles,
    tempHash,
    () => now,
  );
});
it('AUTH-M-003/004: consumes invitation once and issues credentials only after permanent password activation', async () => {
  expect(await service.activate(input)).toMatchObject({
    accessToken: 'credential',
    user: { id: userId },
  });
  const permanentHash = activate.mock.calls[0]?.[0] as string;
  expect(await verifyPassword(permanentHash, input.newPassword)).toBe(true);
  expect(sessions.issue).toHaveBeenCalledWith(userId, 'mobile', expect.any(Function));
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(activate).toHaveBeenCalledTimes(1);
});
it('AUTH-M-003: five wrong passwords persist a lock and cannot subsequently activate', async () => {
  for (let count = 1; count <= 5; count++) {
    await expect(
      service.activate({ ...input, tempPassword: 'Incorrect temporary phrase' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(attempt).toHaveBeenLastCalledWith(count, now);
  }
  expect(invitation?.lockedAt).toEqual(now);
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(activate).not.toHaveBeenCalled();
  expect(attempt).toHaveBeenCalledTimes(5);
});
it.each([
  { tempPasswordExpiresAt: now },
  { tempPasswordExpiresAt: null },
  { tempPasswordHash: null },
  { tempPasswordAttempts: 5 },
])('AUTH-M-003: unusable invitation rejects generically: %j', async (changes) => {
  if (!invitation) throw new Error('Missing invitation fixture');
  invitation = { ...invitation, ...changes };
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(activate).not.toHaveBeenCalled();
  expect(attempt).not.toHaveBeenCalled();
});
it.each(['invitation', 'identity'] as const)(
  'AUTH-M-003: missing %s rejects generically',
  async (missing) => {
    invitation = undefined;
    if (missing === 'identity') identity = undefined;
    await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(activate).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  },
);
it('SEC: suspension and failed activation cannot issue sessions', async () => {
  identity = { id: userId, accountStatus: 'suspended', passwordHash: null };
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  identity = { id: userId, accountStatus: 'active', passwordHash: null };
  activate.mockRejectedValueOnce(new Error('Database activation failed'));
  await expect(service.activate(input)).rejects.toThrow('Database activation failed');
  expect(sessions.issue).not.toHaveBeenCalled();
});
it('SEC: a changed password or revoked grant between activation and issuance prevents a stale session', async () => {
  activate.mockImplementationOnce(async () => {
    locked = { id: userId, accountStatus: 'active', managerActive: false };
  });
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  activate.mockImplementationOnce(async () => {
    locked = { id: userId, accountStatus: 'active', managerActive: true, passwordHash: 'changed' };
  });
  await expect(service.activate(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
});

it.each([tempPassword, 'Incorrect temporary phrase'])(
  'CHG-006 SEC: temporary invitation credentials cannot replace or lock an existing permanent identity',
  async (temporary) => {
    if (!identity) throw new Error('Missing identity fixture');
    Object.assign(identity, { passwordHash: tempHash });
    await expect(service.activate({ ...input, tempPassword: temporary })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(activate).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
    expect(invitation?.status).toBe('pending_activation');
  },
);
