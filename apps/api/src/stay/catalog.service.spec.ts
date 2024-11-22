import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  catalogActor as actor,
  catalogIds as ids,
  catalogNow as now,
  catalogInput as input,
  catalogEntry as entry,
  catalogPage as page,
} from '../../test/unit/billing-catalog.fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { BillingCatalogRepository } from './catalog.repository.js';
import { BillingCatalogService } from './catalog.service.js';
function fixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, value) => {
          responses.set(key, value);
        },
      }),
  };
  const repository = new BillingCatalogRepository(query.database),
    authorizeCreate = vi.spyOn(repository, 'authorizeCreate').mockResolvedValue(true),
    authorizeArchive = vi.spyOn(repository, 'authorizeArchive').mockResolvedValue(true);
  const create = vi.spyOn(repository, 'create').mockImplementation(async (transaction) => {
      expect(requireTransaction()).toBe(transaction);
      return entry;
    }),
    archive = vi.spyOn(repository, 'archive').mockImplementation(async (transaction) => {
      expect(requireTransaction()).toBe(transaction);
      return { ...entry, archivedAt: now.toISOString() };
    }),
    read = vi.spyOn(repository, 'read').mockResolvedValue(page);
  return {
    query,
    responses,
    authorizeCreate,
    authorizeArchive,
    create,
    archive,
    read,
    service: new BillingCatalogService(repository, new IdempotencyService(store, () => now)),
  };
}
it('FIN-004 / ACC-004: canonical catalogue creation replays only after fresh Owner authority', async () => {
  const f = fixture(),
    key = randomUUID();
  const first = await f.service.create(actor, key, ids.branch.toUpperCase(), {
    ...input,
    name: ' Electricity ',
  });
  expect(first).toEqual({ status: 201, body: entry, replayed: false });
  expect((await f.service.create(actor, key, ids.branch, input)).replayed).toBe(true);
  expect(f.create).toHaveBeenCalledTimes(1);
  expect(f.authorizeCreate).toHaveBeenCalledTimes(2);
  f.authorizeCreate.mockRejectedValueOnce(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Owner changed'),
  );
  await expect(f.service.create(actor, key, ids.branch, input)).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('FIN-004 / AUD-004: archive reason/target is immutable under replay and the caller transaction is retained', async () => {
  const f = fixture(),
    key = randomUUID(),
    target = { branchId: ids.branch, catalogId: ids.entry };
  expect(
    (await f.service.archive(actor, key, target, { reason: ' Retired code ' })).body.archivedAt,
  ).toBe(now.toISOString());
  expect((await f.service.archive(actor, key, target, { reason: 'Retired code' })).replayed).toBe(
    true,
  );
  expect(f.archive).toHaveBeenCalledTimes(1);
  expect(f.authorizeArchive).toHaveBeenCalledTimes(2);
  await expect(
    f.service.archive(actor, key, { ...target, catalogId: ids.next }, { reason: 'Retired code' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  await expect(
    f.service.archive(actor, key, target, { reason: 'Different reason' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  f.authorizeArchive.mockResolvedValueOnce(false);
  await expect(
    f.service.archive(actor, key, target, { reason: 'Retired code' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('ACC-004: the same idempotency key cannot alias another branch, price or operation', async () => {
  const f = fixture(),
    key = randomUUID();
  await f.service.create(actor, key, ids.branch, input);
  for (const [branch, body] of [
    [ids.brand, input],
    [ids.branch, { ...input, unitAmountPaisa: 3501 }],
  ] as const)
    await expect(f.service.create(actor, key, branch, body)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  await expect(
    f.service.archive(
      actor,
      key,
      { branchId: ids.branch, catalogId: ids.entry },
      { reason: 'Retired' },
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  expect(f.create).toHaveBeenCalledTimes(1);
  expect(f.archive).not.toHaveBeenCalled();
});
it.each([
  { unitAmountPaisa: 0 },
  { unitAmountPaisa: 1.5 },
  { ownerUserId: ids.owner },
  { id: ids.entry },
])(
  'FIN-004 / SEC-003: invalid or injected creation case %# fails before authorization',
  (patch) => {
    const f = fixture();
    expect(() =>
      f.service.create(actor, randomUUID(), ids.branch, { ...input, ...patch }),
    ).toThrow();
    expect(f.authorizeCreate).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  },
);
it('AUD-004: failed mandatory work never stores a successful catalogue idempotency response', async () => {
  const f = fixture();
  f.create.mockRejectedValueOnce(new Error('Mandatory audit failed'));
  await expect(f.service.create(actor, randomUUID(), ids.branch, input)).rejects.toThrow(
    'Mandatory audit failed',
  );
  expect(f.responses.size).toBe(0);
});
it('FIN-004: database uniqueness conflicts are typed without exposing SQL or price history', async () => {
  const f = fixture();
  f.create.mockRejectedValueOnce({ code: '23505' });
  await expect(f.service.create(actor, randomUUID(), ids.branch, input)).rejects.toMatchObject({
    code: 'CONFLICT',
    status: 409,
  });
  expect(f.responses.size).toBe(0);
});
it('ACC-004: read normalizes branch/continuation and rejects unauthorized query fields', async () => {
  const f = fixture();
  expect(
    await f.service.read(actor, ids.branch.toUpperCase(), {
      limit: '20',
      includeArchived: 'false',
    }),
  ).toEqual(page);
  expect(f.read).toHaveBeenCalledWith(actor, ids.branch, { limit: 20, includeArchived: 'false' });
  await expect(f.service.read(actor, ids.branch, { userId: ids.owner })).rejects.toThrow();
  await expect(f.service.read(actor, 'invalid')).rejects.toThrow();
  expect(f.read).toHaveBeenCalledTimes(1);
});
it('ACC-004: an internally valid read for a different branch still fails closed', async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce({ ...page, branchId: ids.brand, data: [] });
  await expect(f.service.read(actor, ids.branch)).rejects.toMatchObject({ code: 'INTERNAL' });
});
it.each([
  { branchId: ids.brand },
  { code: 'different_code' },
  { name: 'Different name' },
  { unitLabel: 'different unit' },
  { unitAmountPaisa: 3501 },
  { archivedAt: now.toISOString() },
])(
  'FIN-004 / ACC-004: mismatched new or replayed creation facts case %# cannot show success',
  async (patch) => {
    const f = fixture();
    f.create.mockResolvedValueOnce({ ...entry, ...patch });
    await expect(f.service.create(actor, randomUUID(), ids.branch, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(f.responses.size).toBe(0);
  },
);
it.each([{ branchId: ids.brand }, { id: ids.next }, { archivedAt: null }])(
  'FIN-004 / ACC-004: wrong-scope or non-archived archive response case %# cannot show success',
  async (patch) => {
    const f = fixture();
    f.archive.mockResolvedValueOnce({ ...entry, archivedAt: now.toISOString(), ...patch });
    await expect(
      f.service.archive(
        actor,
        randomUUID(),
        { branchId: ids.branch, catalogId: ids.entry },
        { reason: 'Retired' },
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(f.responses.size).toBe(0);
  },
);
it('SEC-003: malformed archive scope/reason fails before repository authorization', () => {
  const f = fixture();
  expect(() =>
    f.service.archive(
      actor,
      randomUUID(),
      { branchId: ids.branch, catalogId: ids.entry, userId: ids.owner },
      { reason: 'Retired' },
    ),
  ).toThrow();
  expect(() =>
    f.service.archive(
      actor,
      randomUUID(),
      { branchId: ids.branch, catalogId: ids.entry },
      { reason: ' ' },
    ),
  ).toThrow();
  expect(f.authorizeArchive).not.toHaveBeenCalled();
});

it('ACC-004: catalogue response cannot silently widen archive visibility, page size or continuation', async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce({ ...page, includeArchived: true });
  await expect(f.service.read(actor, ids.branch)).rejects.toMatchObject({ code: 'INTERNAL' });
  f.read.mockResolvedValueOnce({ ...page, data: [entry, { ...entry, id: ids.next }] });
  await expect(f.service.read(actor, ids.branch, { limit: 1 })).rejects.toMatchObject({
    code: 'INTERNAL',
  });
  await expect(f.service.read(actor, ids.branch, { cursor: ids.next })).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});

it('SEC-003: invalid catalogue command keys fail before repository authorization', () => {
  const f = fixture();
  expect(() => f.service.create(actor, 'invalid', ids.branch, input)).toThrow();
  expect(() =>
    f.service.archive(
      actor,
      'invalid',
      { branchId: ids.branch, catalogId: ids.entry },
      { reason: 'Retired' },
    ),
  ).toThrow();
  expect(f.authorizeCreate).not.toHaveBeenCalled();
  expect(f.authorizeArchive).not.toHaveBeenCalled();
});

it('SEC-003: malformed persisted replay is internal failure without rerunning the mutation', async () => {
  const f = fixture(),
    key = randomUUID();
  await f.service.create(actor, key, ids.branch, input);
  const stored = f.responses.get(key);
  if (!stored) throw Error('Missing persisted response');
  f.responses.set(key, { ...stored, responseBody: { ...entry, unitAmountPaisa: 3501 } });
  await expect(f.service.create(actor, key, ids.branch, input)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 500,
  });
  expect(f.authorizeCreate).toHaveBeenCalledTimes(2);
  expect(f.create).toHaveBeenCalledTimes(1);
});
