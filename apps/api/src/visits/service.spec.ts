import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { VisitRepository } from './repository.js';
import { VisitService } from './service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  visitId = randomUUID();
const summary = {
  id: visitId,
  branchId,
  status: 'requested' as const,
  requestedStart: '2026-11-05T05:00:00.000Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T05:00:00.000Z',
  updatedAt: '2026-10-22T05:00:00.000Z',
};
function fixture() {
  const query = queryFixture(),
    rows = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => rows.get(key),
        remove: async (key) => {
          rows.delete(key);
        },
        save: async (key, value) => {
          rows.set(key, value);
        },
      }),
  };
  const repository = new VisitRepository(query.database);
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue(true);
  const create = vi.spyOn(repository, 'create').mockImplementation(async (tx) => {
    expect(requireTransaction()).toBe(tx);
    return summary;
  });
  const action = vi
    .spyOn(repository, 'action')
    .mockResolvedValue({ ...summary, status: 'cancelled' });
  const save = vi
    .spyOn(repository, 'saveHours')
    .mockResolvedValue({ branchId, version: 'a'.repeat(64), windows: [] });
  return {
    query,
    repository,
    authorize,
    create,
    action,
    save,
    service: new VisitService(repository, new IdempotencyService(store)),
  };
}
it('VISIT-001 / SEC-003: creation replays once but revoked customer authority is rechecked', async () => {
  const f = fixture(),
    key = randomUUID(),
    input = { branchId, requestedStart: summary.requestedStart };
  expect((await f.service.create(actor, key, input)).body).toEqual(summary);
  expect((await f.service.create(actor, key, input)).replayed).toBe(true);
  expect(f.create).toHaveBeenCalledTimes(1);
  f.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  await expect(f.service.create(actor, key, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('VISIT-001: changed time cannot reuse a successful command key', async () => {
  const f = fixture(),
    key = randomUUID();
  await f.service.create(actor, key, { branchId, requestedStart: summary.requestedStart });
  await expect(
    f.service.create(actor, key, { branchId, requestedStart: '2026-11-05T06:00:00Z' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});
it('VISIT-001 / ACC-002: customer and branch actions bind exact child, scope and reviewed version', async () => {
  const f = fixture(),
    body = { expectedUpdatedAt: summary.updatedAt, command: { action: 'cancel' } };
  await f.service.action(actor, randomUUID(), visitId, body);
  expect(f.authorize).toHaveBeenLastCalledWith(f.query.transaction, actor, undefined, visitId);
  expect(f.action).toHaveBeenLastCalledWith(f.query.transaction, actor, visitId, body, undefined);
  await f.service.action(
    actor,
    randomUUID(),
    visitId,
    { ...body, command: { action: 'approve' } },
    branchId,
  );
  expect(f.authorize).toHaveBeenLastCalledWith(f.query.transaction, actor, branchId, visitId);
});
it('VISIT-001: hours save retains expected version and reauthorizes replay', async () => {
  const f = fixture(),
    key = randomUUID(),
    body = { expectedVersion: 'a'.repeat(64), windows: [] };
  await f.service.saveHours(actor, key, branchId, body);
  expect((await f.service.saveHours(actor, key, branchId, body)).replayed).toBe(true);
  expect(f.save).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenLastCalledWith(f.query.transaction, actor, branchId);
});
it('VISIT-001 / SEC-003: unknown identity or invalid state input fails before mutation', () => {
  const f = fixture();
  expect(() =>
    f.service.create(actor, randomUUID(), {
      branchId,
      requestedStart: summary.requestedStart,
      customerUserId: randomUUID(),
    }),
  ).toThrow();
  expect(() =>
    f.service.action(actor, randomUUID(), visitId, { command: { action: 'approve' } }),
  ).toThrow();
  expect(f.authorize).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});

it('VISIT-001: read wrappers retain validated date, branch and bounded query scope', async () => {
  const q = queryFixture(),
    repository = new VisitRepository(q.database);
  const publicHours = vi
    .spyOn(repository, 'publicHours')
    .mockResolvedValue({ branchId, date: '2026-11-05', windows: [] });
  const hours = vi
    .spyOn(repository, 'hours')
    .mockResolvedValue({ branchId, version: 'a'.repeat(64), windows: [] });
  const list = vi.spyOn(repository, 'list').mockResolvedValue({ data: [], nextCursor: null });
  const service = new VisitService(
    repository,
    new IdempotencyService({
      transaction: async () => {
        throw Error('Read unexpectedly mutated');
      },
    }),
  );
  await service.publicHours('real-hostel', '2026-11-05');
  expect(publicHours).toHaveBeenCalledWith('real-hostel', '2026-11-05');
  await service.hours(actor, branchId.toUpperCase());
  expect(hours).toHaveBeenCalledWith(actor, branchId);
  await service.list(actor, {});
  expect(list).toHaveBeenLastCalledWith(actor, { limit: 20 }, undefined);
  await service.list(actor, { limit: 1 }, branchId);
  expect(list).toHaveBeenLastCalledWith(actor, { limit: 1 }, branchId);
  expect(() => service.list(actor, { customerUserId: randomUUID() })).toThrow();
});

it('VISIT-001 / SEC-003: history service validates scope and cannot accept a caller-supplied customer', async () => {
  const q = queryFixture(),
    repository = new VisitRepository(q.database);
  const history = vi.spyOn(repository, 'historyPage').mockResolvedValue({
    visitId,
    branchId,
    branchName: 'Hostel',
    customerName: 'Customer',
    data: [],
    nextCursor: null,
  });
  const service = new VisitService(
    repository,
    new IdempotencyService({
      transaction: async () => {
        throw Error('Read mutated');
      },
    }),
  );
  await service.history(actor, visitId.toUpperCase(), {});
  expect(history).toHaveBeenLastCalledWith(actor, visitId, { limit: 20 }, undefined);
  await service.history(actor, visitId, { limit: 1 }, branchId);
  expect(history).toHaveBeenLastCalledWith(actor, visitId, { limit: 1 }, branchId);
  expect(() => service.history(actor, visitId, { customerUserId: randomUUID() })).toThrow();
});

it('VISIT-001 / SEC-003: post-visit decisions retain own authorization before replay and one transactional write', async () => {
  const f = fixture(),
    key = randomUUID();
  const result = {
    visitId,
    branchId,
    expectedUpdatedAt: '2026-10-22T05:00:00.001Z',
    promptedAt: null,
    stillInterested: false,
    respondedAt: summary.updatedAt,
  };
  const record = vi.spyOn(f.repository, 'recordInterest').mockResolvedValue(result);
  const input = { expectedUpdatedAt: summary.updatedAt, stillInterested: false };
  expect((await f.service.recordInterest(actor, key, visitId, input)).body).toEqual(result);
  expect((await f.service.recordInterest(actor, key, visitId, input)).replayed).toBe(true);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(f.query.transaction, actor, visitId, input);
  expect(f.authorize).toHaveBeenLastCalledWith(f.query.transaction, actor, undefined, visitId);
  f.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  await expect(f.service.recordInterest(actor, key, visitId, input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(record).toHaveBeenCalledTimes(1);
});
it('VISIT-001: post-visit reads preserve exact actor and branch scope', async () => {
  const f = fixture(),
    result = {
      visitId,
      branchId,
      expectedUpdatedAt: summary.updatedAt,
      promptedAt: null,
      stillInterested: null,
      respondedAt: null,
    };
  const read = vi.spyOn(f.repository, 'interest').mockResolvedValue(result);
  await f.service.interest(actor, visitId);
  expect(read).toHaveBeenLastCalledWith(actor, visitId, undefined);
  await f.service.interest(actor, visitId, branchId);
  expect(read).toHaveBeenLastCalledWith(actor, visitId, branchId);
});
