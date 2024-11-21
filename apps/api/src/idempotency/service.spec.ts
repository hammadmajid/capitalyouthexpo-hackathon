import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyStore, StoredResponse } from './store.js';
import { IdempotencyService } from './service.js';
import { currentTransaction, requireTransaction } from './context.js';
function fixture() {
  const rows = new Map<string, StoredResponse>();
  const database = {} as Transaction;
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database,
        read: async (key) => rows.get(key),
        remove: async (key) => {
          rows.delete(key);
        },
        save: async (key, value) => {
          rows.set(key, value);
        },
      }),
  };
  let now = new Date('2026-10-08T00:00:00Z');
  const service = new IdempotencyService(store, () => now);
  const command = {
    actor: { userId: randomUUID(), sessionId: randomUUID() },
    key: randomUUID(),
    endpoint: 'POST /action',
    status: 200 as const,
  };
  const schema = z.object({ status: z.literal('suspended') }).strict();
  const authorize = vi.fn(async () => true);
  const work = vi.fn(async () => {
    expect(requireTransaction()).toBe(database);
    return { status: 'suspended' };
  });
  const run = (body: unknown = { reason: 'requested' }) =>
    service.execute(command, { branchId: 'a' }, body, schema, authorize, work);
  return {
    store,
    rows,
    command,
    work,
    authorize,
    run,
    schema,
    service,
    advance: () => {
      now = new Date(now.getTime() + 86400000);
    },
  };
}
it('PAY-008: replay returns original validated response without another mutation', async () => {
  const value = fixture();
  expect(currentTransaction()).toBeUndefined();
  expect(() => requireTransaction()).toThrow('required');
  expect(await value.run()).toEqual({
    body: { status: 'suspended' },
    status: 200,
    replayed: false,
  });
  expect(await value.run()).toEqual({ body: { status: 'suspended' }, status: 200, replayed: true });
  expect(value.work).toHaveBeenCalledTimes(1);
  expect(value.authorize).toHaveBeenCalledTimes(2);
  expect(currentTransaction()).toBeUndefined();
  await expect(value.run({ reason: 'different' })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
});

it('OUT-005 / PAY-008: bounded large checkout responses replay once and still recheck live authority', async () => {
  const value = fixture();
  const response = { rows: 'x'.repeat(80000) };
  const work = vi.fn(async () => response);
  const run = () =>
    value.service.execute(
      value.command,
      {},
      null,
      z.object({ rows: z.string() }).strict(),
      value.authorize,
      work,
      { maximumResponseBytes: 262144 },
    );
  expect((await run()).replayed).toBe(false);
  expect((await run()).replayed).toBe(true);
  expect(work).toHaveBeenCalledTimes(1);
  value.authorize.mockResolvedValueOnce(false);
  await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(work).toHaveBeenCalledTimes(1);
});
it('PAY-008: expired entries are replaced and replay never bypasses live scope denial', async () => {
  const value = fixture();
  await value.run();
  value.authorize.mockRejectedValueOnce(new Error('Grant revoked'));
  await expect(value.run()).rejects.toThrow('Grant revoked');
  expect(value.work).toHaveBeenCalledTimes(1);
  value.advance();
  expect((await value.run({ reason: 'different' })).replayed).toBe(false);
  expect(value.work).toHaveBeenCalledTimes(2);
});
it('SEC: failed mutations and unsafe responses cannot create a replay record', async () => {
  const value = fixture();
  value.work.mockRejectedValueOnce(new Error('Mutation failed'));
  await expect(value.run()).rejects.toThrow('Mutation failed');
  expect(value.rows.size).toBe(0);
  await expect(
    value.service.execute(value.command, {}, null, z.unknown(), value.authorize, async () => ({
      accessToken: 'must never persist',
    })),
  ).rejects.toThrow('Sensitive');
  expect(value.rows.size).toBe(0);
  expect(currentTransaction()).toBeUndefined();
  await expect(
    value.service.execute(
      { ...value.command, key: 'invalid' },
      {},
      null,
      value.schema,
      value.authorize,
      value.work,
    ),
  ).rejects.toThrow();
});
it('SEC: a false scope decision denies replay and a default clock remains usable', async () => {
  const value = fixture();
  await value.run();
  value.authorize.mockResolvedValueOnce(false);
  await expect(value.run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const service = new IdempotencyService(value.store);
  expect(
    (
      await service.execute(
        { ...value.command, key: randomUUID() },
        {},
        null,
        value.schema,
        value.authorize,
        value.work,
      )
    ).replayed,
  ).toBe(false);
});

it('PAY-008 SEC-003: a participant-scoped store preserves the existing idempotency clock and expiry', async () => {
  const value = fixture(),
    observed: string[] = [];
  const store: IdempotencyStore = {
    transaction: (actor, now, work) => {
      observed.push(now.toISOString());
      return value.store.transaction(actor, now, work);
    },
  };
  const scoped = value.service.withStore(store);
  const run = () =>
    scoped.execute(
      value.command,
      { branchId: 'a' },
      { reason: 'requested' },
      value.schema,
      value.authorize,
      value.work,
    );
  expect((await run()).replayed).toBe(false);
  expect((await run()).replayed).toBe(true);
  value.advance();
  expect((await run()).replayed).toBe(false);
  expect(observed).toEqual([
    '2026-10-08T00:00:00.000Z',
    '2026-10-08T00:00:00.000Z',
    '2026-10-09T00:00:00.000Z',
  ]);
  expect(value.work).toHaveBeenCalledTimes(2);
  expect(value.authorize).toHaveBeenCalledTimes(3);
});
