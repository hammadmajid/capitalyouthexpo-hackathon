import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { RegistrationRepository } from './registration.repository.js';
import type { OtpTransaction } from './otp.store.js';
const now = new Date('2026-10-10T12:00:00Z'),
  userId = randomUUID();
const email = 'pending@example.test',
  tokenHash = 'a'.repeat(64);
const identity = {
  id: userId,
  email,
  emailVerifiedAt: now,
  passwordHash: null,
  accountStatus: 'active',
};
const grant = {
  id: randomUUID(),
  userId,
  tokenHash,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 600000),
  consumedAt: null,
};
const database = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  limit: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const method of ['from', 'where', 'values', 'set'] as const)
    chain[method].mockReturnValue(chain);
  chain.for.mockResolvedValue([identity]);
  chain.limit.mockResolvedValue([{ userId }]);
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () => new RegistrationRepository(database as unknown as Database);
it('AUTH-C: pending start locks the canonical email identity and never sets password, phone or customer capability', async () => {
  const work = vi.fn(async () => undefined);
  await repository().start(email, now, work);
  expect(chain.values).toHaveBeenCalledWith({
    fullName: '',
    email,
    createdAt: now,
    updatedAt: now,
  });
  expect(chain.onConflictDoNothing).toHaveBeenCalledTimes(1);
  expect(chain.for).toHaveBeenCalledWith('update');
  expect(work).toHaveBeenCalledWith(expect.objectContaining({ identity }));
  expect(database.insert).toHaveBeenCalledTimes(1);
});
it('SEC: replacement setup grants retire previous unconsumed grants and store only the bounded digest', async () => {
  const repo = repository();
  expect(
    await repo.transaction(email, (transaction) => repo.grant(transaction, tokenHash, now)),
  ).toBe('password');
  expect(chain.set).toHaveBeenCalledWith({ consumedAt: now });
  expect(chain.values).toHaveBeenCalledWith({
    userId,
    tokenHash,
    createdAt: now,
    expiresAt: grant.expiresAt,
  });
  expect(chain.values.mock.calls[0]?.[0]).not.toHaveProperty('setupToken');
});
it('SEC: permanent credentials cannot be replaced by signup authorization', async () => {
  chain.for.mockResolvedValue([{ ...identity, passwordHash: 'permanent-hash' }]);
  const repo = repository();
  expect(
    await repo.transaction(email, (transaction) => repo.grant(transaction, tokenHash, now)),
  ).toBe('login');
  expect(database.update).not.toHaveBeenCalled();
  expect(database.insert).not.toHaveBeenCalled();
});
it.each(['missing', 'inactive'] as const)(
  'SEC: %s identity cannot create a setup grant',
  async (kind) => {
    chain.for.mockResolvedValue(
      kind === 'missing' ? [] : [{ ...identity, accountStatus: 'suspended' }],
    );
    const repo = repository();
    await expect(
      repo.transaction(email, (transaction) => repo.grant(transaction, tokenHash, now)),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(database.insert).not.toHaveBeenCalled();
  },
);
it('SEC: grants must belong to the locked registration transaction implementation', () => {
  expect(() => repository().grant({} as OtpTransaction, tokenHash, now)).toThrow(
    'Invalid registration transaction',
  );
});
it('AUTH-C: setup completion locks identity before grant and consumes setup with the password write', async () => {
  chain.for.mockResolvedValueOnce([identity]).mockResolvedValueOnce([grant]);
  expect(await repository().complete(tokenHash, 'protected-hash', now)).toBe(userId);
  expect(chain.for.mock.calls).toEqual([['update'], ['update']]);
  expect(chain.set.mock.calls).toEqual([
    [{ passwordHash: 'protected-hash', updatedAt: now }],
    [{ consumedAt: now }],
  ]);
});
it('SEC: an unknown setup digest cannot enter identity mutation', async () => {
  chain.limit.mockResolvedValue([]);
  await expect(repository().complete(tokenHash, 'protected-hash', now)).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(chain.for).not.toHaveBeenCalled();
  expect(database.update).not.toHaveBeenCalled();
});
it.each([
  'missing-identity',
  'inactive',
  'unverified',
  'permanent',
  'missing-grant',
  'consumed',
  'expired',
] as const)('SEC: %s setup completion fails without password or grant mutation', async (kind) => {
  const user =
    kind === 'missing-identity'
      ? []
      : [
          {
            ...identity,
            ...(kind === 'inactive' ? { accountStatus: 'suspended' } : {}),
            ...(kind === 'unverified' ? { emailVerifiedAt: null } : {}),
            ...(kind === 'permanent' ? { passwordHash: 'existing-hash' } : {}),
          },
        ];
  const setup =
    kind === 'missing-grant'
      ? []
      : [
          {
            ...grant,
            ...(kind === 'consumed' ? { consumedAt: now } : {}),
            ...(kind === 'expired' ? { expiresAt: now } : {}),
          },
        ];
  chain.for.mockResolvedValueOnce(user).mockResolvedValueOnce(setup);
  await expect(repository().complete(tokenHash, 'protected-hash', now)).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(database.update).not.toHaveBeenCalled();
});
it('SEC: pending start and setup persistence failures propagate to the database transaction boundary', async () => {
  await expect(
    repository().start(email, now, async () => {
      throw new Error('Outbox unavailable');
    }),
  ).rejects.toThrow('Outbox unavailable');
  chain.for.mockResolvedValueOnce([identity]).mockResolvedValueOnce([grant]);
  chain.set.mockImplementationOnce(() => {
    throw new Error('Password persistence unavailable');
  });
  await expect(repository().complete(tokenHash, 'protected-hash', now)).rejects.toThrow(
    'Password persistence unavailable',
  );
});
