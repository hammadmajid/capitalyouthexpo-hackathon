import { bookings, idempotencyKeys } from '@hsm/db';
import { lockParticipants } from '../management/identity-lock.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { BookingActionRepository } from './actions.repository.js';
import { BookingActionService } from './actions.service.js';
vi.mock('../management/identity-lock.js', () => ({ lockParticipants: vi.fn() }));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID();
const quoteInput = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...quoteInput,
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-14T12:00:00Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});

function fixture() {
  const database = queryFixture();
  const rows = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: database.transaction,
        read: async (key) => rows.get(key),
        remove: async (key) => {
          rows.delete(key);
        },
        save: async (key, value) => {
          rows.set(key, value);
        },
      }),
  };
  const repository = new BookingActionRepository(database.database, new AuditWriter());
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const id = randomUUID(),
    key = randomUUID();
  const summary = bookingSummarySchema.parse({
    id,
    branchId,
    reference: 'HSM-' + id.replaceAll('-', '').toUpperCase(),
    state: 'cancelled',
    quote,
    createdAt: '2026-10-14T12:00:00Z',
    requestExpiresAt: null,
    documents: [],
    upfront: null,
  });
  const authorize = vi.spyOn(repository, 'authorizeCustomer').mockResolvedValue(true);
  const authorizeBranch = vi.spyOn(repository, 'authorize').mockResolvedValue(true);
  const cancel = vi.spyOn(repository, 'cancel').mockResolvedValue(summary);
  const service = new BookingActionService(repository, new IdempotencyService(store));
  const run = (branch?: string) =>
    service.action(actor, key, id, 'cancel', { reason: 'Plans changed' }, branch);
  return {
    run,
    authorize,
    authorizeBranch,
    cancel,
    summary,
    actor,
    id,
    key,
    rows,
    database,
    repository,
    service,
  };
}
it('BKG-001: Customer cancellation commits and replays with live authorization', async () => {
  const value = fixture();
  await expect(value.run()).resolves.toMatchObject({ replayed: false, body: value.summary });
  await expect(value.run()).resolves.toMatchObject({ replayed: true, body: value.summary });
  expect(value.cancel).toHaveBeenCalledTimes(1);
  expect(value.authorize).toHaveBeenCalledTimes(2);
  expect(value.authorizeBranch).not.toHaveBeenCalled();
  value.authorize.mockResolvedValue(false);
  await expect(value.run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.cancel).toHaveBeenCalledTimes(1);
});
it('BKG-001: management cancellation retains explicit branch authorization', async () => {
  const value = fixture();
  await expect(value.run(branchId)).resolves.toMatchObject({ replayed: false });
  await expect(value.run(branchId)).resolves.toMatchObject({ replayed: true });
  expect(value.authorizeBranch).toHaveBeenCalledTimes(2);
  expect(value.authorize).not.toHaveBeenCalled();
  expect(value.cancel).toHaveBeenCalledTimes(1);
});

it('ACC-001 SEC-003: confirmation locks acting staff and Customer before the main inventory transaction', async () => {
  const value = fixture(),
    customerId = randomUUID(),
    order: string[] = [];
  value.database.enqueue(bookings, [{ customerUserId: customerId }]);
  vi.mocked(lockParticipants).mockImplementation(async () => {
    order.push('participants');
  });
  value.authorizeBranch.mockImplementation(async () => {
    order.push('authority');
    return true;
  });
  const confirm = vi.spyOn(value.repository, 'confirm').mockImplementation(async () => {
    order.push('mutation');
    return { ...value.summary, state: 'confirmed' };
  });
  await value.service.action(
    value.actor,
    value.key,
    value.id,
    'confirm',
    { reason: 'Approved request' },
    branchId,
  );
  expect(lockParticipants).toHaveBeenCalledWith(
    value.database.transaction,
    value.actor,
    customerId,
    expect.any(Function),
  );
  expect(order.indexOf('participants')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('participants')).toBeLessThan(order.indexOf('authority'));
  expect(order.indexOf('authority')).toBeLessThan(order.indexOf('mutation'));
  expect(confirm).toHaveBeenCalledOnce();
});

it('BKG-001 SEC-003: confirmation replays through the scoped store and rechecks live branch authority', async () => {
  const value = fixture(),
    customerId = randomUUID();
  value.database.enqueue(
    bookings,
    [{ customerUserId: customerId }],
    [{ customerUserId: customerId }],
    [{ customerUserId: customerId }],
  );
  const confirm = vi
    .spyOn(value.repository, 'confirm')
    .mockResolvedValue({ ...value.summary, state: 'confirmed' });
  const run = () =>
    value.service.action(
      value.actor,
      value.key,
      value.id,
      'confirm',
      { reason: 'Approved request' },
      branchId,
    );
  expect((await run()).replayed).toBe(false);
  const saved = value.database.writes.find((write) => write.table === idempotencyKeys);
  if (!saved) throw new Error('Scoped replay record missing');
  value.database.enqueue(idempotencyKeys, [saved.value]);
  expect((await run()).replayed).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(value.rows.size).toBe(0);
  value.authorizeBranch.mockResolvedValue(false);
  await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(value.authorizeBranch).toHaveBeenCalledTimes(3);
});

it('BKG-001 ACC-004: rejection retains its existing scoped transaction without confirmation participant lookup', async () => {
  const value = fixture();
  const reject = vi
    .spyOn(value.repository, 'reject')
    .mockResolvedValue({ ...value.summary, state: 'rejected' });
  const context = vi.spyOn(value.repository, 'confirmationContext');
  const result = await value.service.action(
    value.actor,
    value.key,
    value.id,
    'reject',
    { reason: 'No longer available' },
    branchId,
  );
  expect(result.body.state).toBe('rejected');
  expect(value.authorizeBranch).toHaveBeenCalledOnce();
  expect(reject).toHaveBeenCalledOnce();
  expect(context).not.toHaveBeenCalled();
  expect(lockParticipants).not.toHaveBeenCalled();
});
it.each(['confirm', 'reject'] as const)(
  'ACC-004: %s without a management branch is denied before mutation',
  async (action) => {
    const value = fixture(),
      confirm = vi.spyOn(value.repository, 'confirm'),
      reject = vi.spyOn(value.repository, 'reject');
    await expect(
      value.service.action(value.actor, value.key, value.id, action, { reason: 'Requested' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(confirm).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(lockParticipants).not.toHaveBeenCalled();
    expect(value.rows.size).toBe(0);
  },
);

it('AUD-009 / BKG-004: pending-request queue scope is validated and forwarded without changing default history', async () => {
  const value = fixture();
  const list = vi.spyOn(value.repository, 'list').mockResolvedValue({ data: [], nextCursor: null });
  await value.service.list(value.actor, branchId, { queue: 'pending_requests', limit: 1 });
  expect(list).toHaveBeenCalledWith(value.actor, branchId, { queue: 'pending_requests', limit: 1 });
  expect(() => value.service.list(value.actor, branchId, { queue: 'all' })).toThrow();
});
