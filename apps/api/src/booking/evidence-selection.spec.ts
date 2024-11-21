import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { bookingDocuments } from '@hsm/db';
import { bookingPolicySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { selectEvidence, consumeEvidence, type PreparedEvidence } from './evidence-selection.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const input = { kind: 'student_id' as const, fileId: randomUUID() };
const now = new Date('2026-10-15T10:00:00Z');
const policy = bookingPolicySchema.parse({
  bookingMode: 'instant',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 365,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 0,
  allowedStayUnits: ['day'],
  requiredDocuments: ['student_id'],
  allowEvidenceReuse: false,
  documentReviewRequired: true,
});
function accepted() {
  return {
    id: randomUUID(),
    state: 'accepted',
    bookingId: null,
    consumedAt: null,
    reviewedAt: now,
    reviewedByUserId: randomUUID(),
  };
}
it('BKG-001 / CHG-007: fresh approval may be consumed once even when reuse is disabled', async () => {
  const store = queryFixture(),
    source = accepted();
  store.enqueue(bookingDocuments, [source], [source]);
  await expect(selectEvidence(store.transaction, actor, branchId, policy, input)).resolves.toEqual({
    ...input,
    state: 'accepted',
    reviewedAt: now,
    reviewedByUserId: source.reviewedByUserId,
    sourceDocumentId: source.id,
  });
  expect(store.locks).toHaveLength(2);
});
it.each([false, true])('BKG-001: latest rejection blocks old approval, reuse=%s', async (reuse) => {
  const store = queryFixture();
  store.enqueue(bookingDocuments, [{ ...accepted(), state: 'rejected' }], [accepted()]);
  await expect(
    selectEvidence(
      store.transaction,
      actor,
      branchId,
      { ...policy, allowEvidenceReuse: reuse },
      input,
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('BKG-001: consumed approval cannot satisfy disabled reuse', async () => {
  const store = queryFixture();
  store.enqueue(bookingDocuments, [{ ...accepted(), consumedAt: now }], []);
  await expect(
    selectEvidence(store.transaction, actor, branchId, policy, input),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('BKG-001: allowed historical reuse preserves reviewer without consuming twice', async () => {
  const store = queryFixture(),
    source = { ...accepted(), consumedAt: now };
  store.enqueue(bookingDocuments, [source], []);
  await expect(
    selectEvidence(
      store.transaction,
      actor,
      branchId,
      { ...policy, allowEvidenceReuse: true },
      input,
    ),
  ).resolves.toMatchObject({
    state: 'accepted',
    sourceDocumentId: null,
    reviewedByUserId: source.reviewedByUserId,
  });
});
it('BKG-001: a newer review supersedes older standalone approval', async () => {
  const store = queryFixture(),
    latest = { ...accepted(), bookingId: randomUUID() };
  store.enqueue(
    bookingDocuments,
    [latest],
    [{ ...accepted(), reviewedAt: new Date(now.getTime() - 1) }],
  );
  await expect(
    selectEvidence(store.transaction, actor, branchId, policy, input),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it.each(['reviewedAt', 'reviewedByUserId'] as const)(
  'SEC-003: missing %s fails closed',
  async (field) => {
    const store = queryFixture(),
      source = { ...accepted(), [field]: null };
    store.enqueue(bookingDocuments, [source], [source]);
    await expect(
      selectEvidence(
        store.transaction,
        actor,
        branchId,
        { ...policy, allowEvidenceReuse: true },
        input,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  },
);
it.each([true, false])(
  'BKG-001: request accepts pending evidence; existing submission=%s',
  async (exists) => {
    const store = queryFixture(),
      id = randomUUID();
    store.enqueue(bookingDocuments, [], [], exists ? [{ id }] : []);
    await expect(
      selectEvidence(
        store.transaction,
        actor,
        branchId,
        { ...policy, bookingMode: 'request' },
        input,
      ),
    ).resolves.toEqual({
      ...input,
      state: 'pending',
      reviewedAt: null,
      reviewedByUserId: null,
      sourceDocumentId: exists ? id : null,
    });
  },
);
it('BKG-001: policy may permit instant booking without document review', async () => {
  const store = queryFixture();
  store.enqueue(bookingDocuments, [], [], []);
  await expect(
    selectEvidence(
      store.transaction,
      actor,
      branchId,
      { ...policy, documentReviewRequired: false },
      input,
    ),
  ).resolves.toHaveProperty('state', 'pending');
});
function prepared(sourceDocumentId: string | null): PreparedEvidence {
  return { ...input, state: 'pending', reviewedAt: null, reviewedByUserId: null, sourceDocumentId };
}
it('BKG-001: consumption updates each source once and skips historical snapshots', async () => {
  const store = queryFixture(),
    id = randomUUID();
  store.enqueue(bookingDocuments, [{ id }]);
  await expect(
    consumeEvidence(
      store.transaction,
      actor,
      branchId,
      [prepared(id), prepared(id), prepared(null)],
      now,
    ),
  ).resolves.toEqual([id]);
  expect(store.writes).toEqual([
    { table: bookingDocuments, kind: 'update', value: { consumedAt: now } },
  ]);
});
it('BKG-001 / ACC-001: lost consumption race aborts the enclosing transaction', async () => {
  const store = queryFixture();
  store.enqueue(bookingDocuments, []);
  await expect(
    consumeEvidence(store.transaction, actor, branchId, [prepared(randomUUID())], now),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
