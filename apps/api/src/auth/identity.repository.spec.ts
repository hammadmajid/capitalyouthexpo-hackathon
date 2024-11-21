import { randomBytes } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { IdentityRepository } from './identity.repository.js';
const database = { select: vi.fn(), insert: vi.fn(), transaction: vi.fn() };
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
};
const row = {
  fullName: 'Identity',
  email: 'identity@example.com',
  phoneE164: '+923001234567',
  cnicHash: randomBytes(32),
};
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  for (const method of ['from', 'where', 'values'] as const) chain[method].mockReturnValue(chain);
  chain.limit.mockResolvedValue([]);
  chain.returning.mockResolvedValue([
    { id: 'actor', email: row.email, emailVerifiedAt: null, accountStatus: 'active' },
  ]);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () => new IdentityRepository(database as unknown as Database);
it('AUTH-C-001: identity lookup remains internal and registration atomically creates customer profile and OTP', async () => {
  chain.limit.mockResolvedValueOnce([{ id: 'actor' }]);
  expect(await repository().find(row.email)).toEqual({ id: 'actor' });
  expect(await repository().find('missing')).toBeUndefined();
  const work = vi.fn().mockResolvedValue(undefined);
  await repository().register(row, work);
  expect(chain.values).toHaveBeenCalledWith(row);
  expect(chain.values).toHaveBeenCalledWith({ userId: 'actor' });
  expect(work).toHaveBeenCalledWith(
    expect.objectContaining({ identity: expect.objectContaining({ id: 'actor' }) }),
  );
});
it('AUTH-C-001: duplicates distinguish unclaimed identities without exposing private fields', async () => {
  for (const [status, code] of [
    ['active', 'IDENTITY_EXISTS'],
    ['unclaimed', 'IDENTITY_EXISTS_CLAIM_REQUIRED'],
  ]) {
    chain.limit.mockResolvedValue([{ accountStatus: status }]);
    await expect(repository().register(row, vi.fn())).rejects.toMatchObject({ status: 409, code });
  }
});
it('SEC: malformed registration and missing insert result fail closed', async () => {
  for (const value of [
    { ...row, email: null },
    { ...row, phoneE164: null },
    { ...row, cnicHash: null },
  ])
    await expect(repository().register(value, vi.fn())).rejects.toThrow('Incomplete');
  chain.returning.mockResolvedValue([]);
  await expect(repository().register(row, vi.fn())).rejects.toThrow('Registration unavailable');
});
it('SEC: concurrent unique violations are sanitized and other errors propagate for rollback', async () => {
  for (const error of [
    Object.assign(new Error('private SQL'), { code: '23505' }),
    new Error('private query', {
      cause: Object.assign(new Error('private SQL'), { code: '23505' }),
    }),
  ]) {
    database.transaction.mockRejectedValueOnce(error);
    await expect(repository().register(row, vi.fn())).rejects.toMatchObject({
      code: 'IDENTITY_EXISTS',
      message: 'Identity already exists',
    });
  }
  for (const error of [
    new Error('transaction unavailable'),
    'unexpected failure',
    new Error('other', { cause: new Error('other') }),
  ]) {
    database.transaction.mockRejectedValueOnce(error);
    await expect(repository().register(row, vi.fn())).rejects.toBe(error);
  }
});
