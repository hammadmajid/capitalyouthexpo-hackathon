import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { bookingDocuments, bookings, files } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ownerBookingEvidence } from './evidence-access.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const branchId = randomUUID(),
  documentId = randomUUID(),
  customerId = randomUUID();
const fileId = randomUUID(),
  now = new Date('2026-10-15T10:00:00Z');
beforeEach(() => vi.resetAllMocks());
function fixture(bookingId: string | null = null, consumedAt: Date | null = null) {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'sensitive').mockResolvedValue(undefined);
  store.enqueue(bookingDocuments, [
    { id: documentId, branchId, bookingId, consumedAt, customerUserId: customerId, fileId },
  ]);
  const read = () =>
    ownerBookingEvidence(
      store.transaction,
      actor,
      branchId,
      documentId,
      'private-bucket',
      () => now,
      audit,
    );
  return { ...store, record, read };
}
it('CHG-008 / SEC-003: Owner evidence read requires live actor and Owner-only branch scope', async () => {
  const store = fixture();
  store.enqueue(files, [
    {
      id: fileId,
      sha256: Buffer.alloc(32),
      objectKey: 'private/resident_document/' + fileId + '/clean.pdf',
    },
  ]);
  await expect(store.read()).resolves.toHaveProperty('file.id', fileId);
  expect(lockActor).toHaveBeenCalledWith(store.transaction, actor, expect.any(Function));
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    undefined,
    true,
  );
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({
      actorUserId: actor.userId,
      subjectUserId: customerId,
      resource: 'private_document',
      resourceId: fileId,
      createdAt: now,
    }),
  );
});
it('CHG-008: Manager denial occurs before evidence access or audit', async () => {
  const store = fixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('FORBIDDEN', 403, 'Owner required'),
  );
  await expect(store.read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(store.predicates).toHaveLength(0);
  expect(store.record).not.toHaveBeenCalled();
});
it.each([null, Buffer.alloc(31)])(
  'SEC-003: missing or invalid clean-file digest fails closed',
  async (digest) => {
    const store = fixture();
    store.enqueue(files, [
      {
        id: fileId,
        sha256: digest,
        objectKey: 'private/resident_document/' + fileId + '/clean.pdf',
      },
    ]);
    await expect(store.read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(store.record).not.toHaveBeenCalled();
  },
);
it('BKG-006 / SEC-003: expired requests do not permit pre-confirmation evidence reads', async () => {
  const store = fixture(randomUUID());
  store.enqueue(bookings, [{ id: randomUUID(), state: 'pending_request', requestExpiresAt: now }]);
  await expect(store.read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.record).not.toHaveBeenCalled();
});
it('SEC-003: audit failure prevents protected data return', async () => {
  const store = fixture();
  store.enqueue(files, [
    {
      id: fileId,
      sha256: Buffer.alloc(32),
      objectKey: 'private/resident_document/' + fileId + '/clean.pdf',
    },
  ]);
  store.record.mockRejectedValue(new Error('Audit unavailable'));
  await expect(store.read()).rejects.toThrow('Audit unavailable');
});

it('SEC-003 / BKG-001: a consumed standalone source cannot bypass its booking access boundary', async () => {
  const store = fixture(null, now);
  store.enqueue(files, [
    {
      id: fileId,
      sha256: Buffer.alloc(32),
      objectKey: 'private/resident_document/' + fileId + '/clean.pdf',
    },
  ]);
  await expect(store.read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.record).not.toHaveBeenCalled();
});
