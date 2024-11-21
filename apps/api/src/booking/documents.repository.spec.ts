import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { bookingDocuments, bookings, lockInventoryBranch } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { ownerBookingEvidence } from './evidence-access.js';
import { requireBookingCustomer } from './evidence.js';
import { publicBranch } from './projection.js';
import { BookingDocumentRepository } from './documents.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../auth/profile-attachments.js', () => ({ ownedProfileAttachment: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./evidence-access.js', () => ({ ownerBookingEvidence: vi.fn() }));
vi.mock('./evidence.js', () => ({ requireBookingCustomer: vi.fn() }));
vi.mock('./projection.js', () => ({ publicBranch: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const organizationId = randomUUID(),
  now = new Date('2026-10-15T10:00:00Z');
const row: typeof bookingDocuments.$inferSelect = {
  id: randomUUID(),
  branchId,
  bookingId: null,
  customerUserId: actor.userId,
  fileId: randomUUID(),
  kind: 'student_id',
  state: 'pending',
  reviewedAt: null,
  reviewedByUserId: null,
  rejectionCode: null,
  consumedAt: null,
  createdAt: now,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(publicBranch).mockResolvedValue({ id: branchId });
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId,
    ownerId: actor.userId,
    brandId: randomUUID(),
    actorRole: 'owner',
  });
  vi.mocked(lockInventoryBranch).mockResolvedValue({
    organization: { id: organizationId },
  } as Awaited<ReturnType<typeof lockInventoryBranch>>);
  vi.mocked(ownedProfileAttachment).mockResolvedValue({
    id: row.fileId,
    purpose: 'resident_document',
    scanStatus: 'clean',
  });
  vi.mocked(ownerBookingEvidence).mockResolvedValue({ document: row, file: {} } as Awaited<
    ReturnType<typeof ownerBookingEvidence>
  >);
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return {
    ...store,
    record,
    repository: new BookingDocumentRepository(store.database, 'private', audit, () => now),
  };
}
const input = { kind: 'student_id' as const, fileId: row.fileId, shareWithOwner: true as const };
it('BKG-001 / CHG-008: submission revalidates live completed Customer and published branch after lock', async () => {
  const store = fixture();
  await expect(store.repository.authorizeSubmit(store.transaction, actor, branchId)).resolves.toBe(
    true,
  );
  expect(lockActor).toHaveBeenCalledWith(store.transaction, actor, expect.any(Function));
  expect(requireBookingCustomer).toHaveBeenCalledWith(store.transaction, actor);
  expect(publicBranch).toHaveBeenCalledTimes(2);
});
it.each([1, 2])(
  'SEC-003: unavailable branch at publication check %s denies submission',
  async (check) => {
    const store = fixture();
    if (check === 2) vi.mocked(publicBranch).mockResolvedValueOnce({ id: branchId });
    vi.mocked(publicBranch).mockResolvedValue(undefined);
    await expect(
      store.repository.submit(store.transaction, actor, branchId, input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(store.writes).toHaveLength(0);
  },
);
it('CHG-008: new private submission stores consent audit without file reference', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [], [row]);
  await expect(
    store.repository.submit(store.transaction, actor, branchId, input),
  ).resolves.toHaveProperty('fileId', row.fileId);
  expect(ownedProfileAttachment).toHaveBeenCalledWith(
    store.transaction,
    actor.userId,
    'private',
    row.fileId,
  );
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({
      actorRole: 'customer',
      after: { kind: 'student_id', shareWithOwner: true, state: 'pending' },
    }),
  );
});
it('BKG-001: repeated pending submission returns existing record without duplicate audit', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [row]);
  await expect(
    store.repository.submit(store.transaction, actor, branchId, input),
  ).resolves.toHaveProperty('id', row.id);
  expect(store.writes).toHaveLength(0);
  expect(store.record).not.toHaveBeenCalled();
});
it.each(['absent', 'purpose', 'scan'] as const)(
  'SEC-003: invalid %s file cannot be submitted',
  async (reason) => {
    const store = fixture();
    vi.mocked(ownedProfileAttachment).mockResolvedValue(
      reason === 'absent'
        ? undefined
        : {
            id: row.fileId,
            purpose: reason === 'purpose' ? 'avatar' : 'resident_document',
            scanStatus: reason === 'scan' ? 'pending' : 'clean',
          },
    );
    await expect(
      store.repository.submit(store.transaction, actor, branchId, input),
    ).rejects.toMatchObject({ code: reason === 'scan' ? 'CONFLICT' : 'NOT_FOUND' });
    expect(store.writes).toHaveLength(0);
  },
);
it('SEC-003: missing returning row cannot produce a successful submission', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [], []);
  await expect(
    store.repository.submit(store.transaction, actor, branchId, input),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(store.record).not.toHaveBeenCalled();
});
it('CHG-008: Owner review records immutable provenance and metadata-only response', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [
    { ...row, state: 'accepted', reviewedAt: now, reviewedByUserId: actor.userId },
  ]);
  const result = await store.repository.review(store.transaction, actor, branchId, row.id, {
    state: 'accepted',
  });
  expect(result).not.toHaveProperty('fileId');
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    undefined,
    true,
  );
  expect(store.writes[0]?.value).toEqual({
    state: 'accepted',
    reviewedByUserId: actor.userId,
    reviewedAt: now,
    rejectionCode: null,
  });
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ action: 'booking.document.reviewed', before: { state: 'pending' } }),
  );
});
it('CHG-008: Manager denial precedes private evidence lookup', async () => {
  const store = fixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('FORBIDDEN', 403, 'Owner required'),
  );
  await expect(
    store.repository.review(store.transaction, actor, branchId, row.id, { state: 'accepted' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(ownerBookingEvidence).not.toHaveBeenCalled();
  expect(store.writes).toHaveLength(0);
});
it('BKG-001: rejection uses approved reason and review timestamp', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [
    { ...row, state: 'rejected', reviewedAt: now, rejectionCode: 'unreadable' },
  ]);
  await store.repository.review(store.transaction, actor, branchId, row.id, {
    state: 'rejected',
    rejectionCode: 'unreadable',
  });
  expect(store.writes[0]?.value).toMatchObject({ state: 'rejected', rejectionCode: 'unreadable' });
});
it.each(['accepted', 'confirmed', 'lost'] as const)(
  'BKG-001: final/changed review %s fails closed',
  async (reason) => {
    const store = fixture();
    if (reason === 'accepted')
      vi.mocked(ownerBookingEvidence).mockResolvedValue({
        document: { ...row, state: 'accepted' },
        file: {},
      } as Awaited<ReturnType<typeof ownerBookingEvidence>>);
    if (reason === 'confirmed') {
      vi.mocked(ownerBookingEvidence).mockResolvedValue({
        document: { ...row, bookingId: randomUUID() },
        file: {},
      } as Awaited<ReturnType<typeof ownerBookingEvidence>>);
      store.enqueue(bookings, [{ state: 'confirmed' }]);
    }
    await expect(
      store.repository.review(store.transaction, actor, branchId, row.id, { state: 'accepted' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.record).not.toHaveBeenCalled();
  },
);
it('SEC-003: own history contains only projected fields and applies cursor validation', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [{ id: row.id }], [row, { ...row, id: randomUUID() }]);
  await expect(
    store.repository.own(actor, branchId, { limit: 1, cursor: row.id }),
  ).resolves.toMatchObject({ nextCursor: row.id, data: [{ fileId: row.fileId }] });
});
it('SEC-003: foreign cursor is unavailable rather than a scope bypass', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, []);
  await expect(
    store.repository.own(actor, branchId, { limit: 1, cursor: randomUUID() }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('CHG-008: Owner queue strips private identifiers and requires Owner scope', async () => {
  const store = fixture();
  store.enqueue(bookingDocuments, [row]);
  const result = await store.repository.queue(actor, branchId, { limit: 20 });
  expect(result.nextCursor).toBeNull();
  expect(result.data[0]).not.toHaveProperty('fileId');
  expect(result.data[0]).not.toHaveProperty('customerUserId');
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    undefined,
    true,
  );
});
