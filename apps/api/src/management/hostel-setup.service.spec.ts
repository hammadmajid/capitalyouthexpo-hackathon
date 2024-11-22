import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyStore } from '../idempotency/store.js';
import { currentTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { HostelSetupRepository } from './hostel-setup.repository.js';
import { HostelSetupService } from './hostel-setup.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  brandId = randomUUID(),
  organizationId = randomUUID();
const now = new Date('2026-10-11T00:00:00Z');
const state = {
  id: brandId,
  organizationId,
  mainBranchId: randomUUID(),
  verificationStatus: 'draft',
  missingFields: ['category'],
};
const database = {} as Transaction;
const repository = {
  authorize: vi.fn(),
  create: vi.fn(),
  basics: vi.fn(),
  main: vi.fn(),
  submit: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
};
const transaction = { database, read: vi.fn(), save: vi.fn(), remove: vi.fn() };
const store = { transaction: vi.fn() };
const service = () =>
  new HostelSetupService(
    repository as unknown as HostelSetupRepository,
    new IdempotencyService(store as IdempotencyStore, () => now),
    () => now,
  );
beforeEach(() => {
  vi.clearAllMocks();
  repository.authorize.mockResolvedValue(true);
  for (const method of ['create', 'basics', 'main', 'submit'] as const)
    repository[method].mockImplementation(async () => {
      expect(currentTransaction()).toBe(database);
      return state;
    });
  repository.read.mockResolvedValue({ private: 'fresh authorized projection' });
  repository.list.mockResolvedValue({ data: [], nextCursor: null });
  transaction.read.mockResolvedValue(undefined);
  transaction.save.mockResolvedValue(undefined);
  store.transaction.mockImplementation(
    async (_actor: unknown, _now: unknown, work: (value: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  );
});
it.each(['create', 'basics', 'main', 'submit'] as const)(
  'ACC-006 SEC: %s uses the idempotency transaction for resource, audit and replay persistence',
  async (operation) => {
    const key = randomUUID(),
      id = operation === 'create' ? organizationId : brandId;
    const body = operation === 'submit' ? {} : { name: '  Saved name  ' };
    const result = await service()[operation](actor, key, id, body);
    expect(result).toEqual({
      status: operation === 'create' ? 201 : 200,
      body: state,
      replayed: false,
    });
    expect(repository.authorize).toHaveBeenCalledWith(
      database,
      actor,
      {
        kind: operation === 'create' ? 'organization' : 'brand',
        id,
      },
      operation === 'submit',
    );
    expect(repository[operation]).toHaveBeenCalledWith(
      database,
      actor,
      id,
      ...(operation === 'submit' ? [now] : [{ name: 'Saved name' }, now]),
    );
    expect(transaction.save).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ responseBody: state }),
    );
    expect(currentTransaction()).toBeUndefined();
  },
);
it('SEC: same-key replay checks exact current scope again before returning cached safe state', async () => {
  const key = randomUUID(),
    body = { name: 'Private hostel' };
  await service().basics(actor, key, brandId, body);
  transaction.read.mockResolvedValue(transaction.save.mock.calls[0]?.[1]);
  expect((await service().basics(actor, key, brandId, body)).replayed).toBe(true);
  expect(repository.basics).toHaveBeenCalledTimes(1);
  repository.authorize.mockRejectedValueOnce(
    new DomainError('NOT_FOUND', 404, 'Hostel unavailable'),
  );
  await expect(service().basics(actor, key, brandId, body)).rejects.toMatchObject({ status: 404 });
  expect(repository.basics).toHaveBeenCalledTimes(1);
});
it('SEC: same-key body or resource changes cannot replay a different mutation', async () => {
  const key = randomUUID();
  await service().basics(actor, key, brandId, { name: 'Saved' });
  transaction.read.mockResolvedValue(transaction.save.mock.calls[0]?.[1]);
  await expect(service().basics(actor, key, brandId, { name: 'Changed' })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  await expect(service().basics(actor, key, randomUUID(), { name: 'Saved' })).rejects.toMatchObject(
    { code: 'IDEMPOTENCY_KEY_REUSED' },
  );
});
it('ACC-006: repository/audit failure leaves no saved replay response', async () => {
  repository.create.mockRejectedValueOnce(new Error('Audit rejected'));
  await expect(
    service().create(actor, randomUUID(), organizationId, { name: 'Hostel' }),
  ).rejects.toThrow('Audit rejected');
  expect(transaction.save).not.toHaveBeenCalled();
  expect(currentTransaction()).toBeUndefined();
});
it('SEC: mutation projection rejects private or unknown output before replay is stored', async () => {
  repository.create.mockResolvedValueOnce({ ...state, addressLine: 'private address' });
  await expect(
    service().create(actor, randomUUID(), organizationId, { name: 'Hostel' }),
  ).rejects.toThrow();
  expect(transaction.save).not.toHaveBeenCalled();
});
it('OWN-001: fresh reads and bounded owner lists do not use replay persistence', async () => {
  expect(await service().read(actor, brandId)).toEqual({ private: 'fresh authorized projection' });
  expect(await service().list(actor, organizationId, { limit: '10' })).toEqual({
    data: [],
    nextCursor: null,
  });
  expect(repository.read).toHaveBeenCalledWith(actor, brandId);
  expect(repository.list).toHaveBeenCalledWith(actor, organizationId, { limit: 10 });
  expect(store.transaction).not.toHaveBeenCalled();
});
it('SEC: invalid identifiers, pagination and approval/ownership spoofing fail at the service boundary', async () => {
  expect(() => service().read(actor, 'invalid')).toThrow();
  expect(() => service().list(actor, organizationId, { limit: 101 })).toThrow();
  expect(() => service().create(actor, randomUUID(), 'invalid', { name: 'Hostel' })).toThrow();
  expect(() =>
    service().main(actor, randomUUID(), brandId, { name: 'Main', verificationStatus: 'approved' }),
  ).toThrow();
  expect(() =>
    service().submit(actor, randomUUID(), brandId, { ownerUserId: actor.userId }),
  ).toThrow();
  expect(store.transaction).not.toHaveBeenCalled();
});
