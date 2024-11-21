import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { BookingDocumentRepository } from './documents.repository.js';
import { BookingDocumentService } from './documents.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  documentId = randomUUID();
const input = { kind: 'student_id', fileId: randomUUID(), shareWithOwner: true };
const metadata = {
  id: documentId,
  branchId,
  bookingId: null,
  kind: 'student_id',
  state: 'pending',
  createdAt: '2026-10-15T10:00:00.000Z',
  reviewedAt: null,
  rejectionCode: null,
} as const;
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
  const repository = new BookingDocumentRepository(query.database, 'private');
  const authorizeSubmit = vi.spyOn(repository, 'authorizeSubmit').mockResolvedValue(true);
  const authorizeOwner = vi.spyOn(repository, 'authorizeOwner').mockResolvedValue(true);
  const submit = vi.spyOn(repository, 'submit').mockImplementation(async () => {
    expect(requireTransaction()).toBe(query.transaction);
    return { ...metadata, fileId: input.fileId, consumedAt: null };
  });
  const review = vi
    .spyOn(repository, 'review')
    .mockResolvedValue({ ...metadata, state: 'accepted', reviewedAt: metadata.createdAt });
  const own = vi.spyOn(repository, 'own').mockResolvedValue({ data: [], nextCursor: null });
  const queue = vi.spyOn(repository, 'queue').mockResolvedValue({ data: [], nextCursor: null });
  return {
    rows,
    authorizeSubmit,
    authorizeOwner,
    submit,
    review,
    own,
    queue,
    service: new BookingDocumentService(repository, new IdempotencyService(store)),
  };
}
it('CHG-008: submission validates consent and executes once; replay rechecks live Customer scope', async () => {
  const value = fixture(),
    key = randomUUID();
  expect((await value.service.submit(actor, key, branchId, input)).status).toBe(201);
  expect((await value.service.submit(actor, key, branchId, input)).replayed).toBe(true);
  expect(value.submit).toHaveBeenCalledTimes(1);
  expect(value.authorizeSubmit).toHaveBeenCalledTimes(2);
  value.authorizeSubmit.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Account unavailable'));
  await expect(value.service.submit(actor, key, branchId, input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.submit).toHaveBeenCalledTimes(1);
});
it('CHG-008: Owner review replay cannot bypass revoked Owner access', async () => {
  const value = fixture(),
    key = randomUUID(),
    body = { state: 'accepted' };
  expect((await value.service.review(actor, key, branchId, documentId, body)).status).toBe(200);
  expect((await value.service.review(actor, key, branchId, documentId, body)).replayed).toBe(true);
  value.authorizeOwner.mockResolvedValue(false);
  await expect(value.service.review(actor, key, branchId, documentId, body)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.review).toHaveBeenCalledTimes(1);
});
it('BKG-001: same idempotency key cannot change review decision', async () => {
  const value = fixture(),
    key = randomUUID();
  await value.service.review(actor, key, branchId, documentId, { state: 'accepted' });
  await expect(
    value.service.review(actor, key, branchId, documentId, {
      state: 'rejected',
      rejectionCode: 'unreadable',
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});
it('SEC-003: invalid consent, decision and identifiers fail before repository access', () => {
  const value = fixture();
  expect(() =>
    value.service.submit(actor, randomUUID(), branchId, { ...input, shareWithOwner: false }),
  ).toThrow();
  expect(() =>
    value.service.review(actor, randomUUID(), branchId, documentId, { state: 'pending' }),
  ).toThrow();
  expect(() => value.service.own(actor, 'invalid', {})).toThrow();
  expect(() => value.service.queue(actor, branchId, { userId: actor.userId })).toThrow();
  expect(value.submit).not.toHaveBeenCalled();
  expect(value.review).not.toHaveBeenCalled();
});
it('SEC-003: list methods use validated bounded pagination', async () => {
  const value = fixture();
  await value.service.own(actor, branchId.toUpperCase(), {});
  await value.service.queue(actor, branchId, { limit: '5' });
  expect(value.own).toHaveBeenCalledWith(actor, branchId, { limit: 20 });
  expect(value.queue).toHaveBeenCalledWith(actor, branchId, { limit: 5 });
});
