import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { bookingDocuments } from '@hsm/db';
import { ownerDocumentState, ownDocumentState } from './document-state.js';
const row: typeof bookingDocuments.$inferSelect = {
  id: randomUUID(),
  branchId: randomUUID(),
  bookingId: null,
  customerUserId: randomUUID(),
  kind: 'student_id',
  fileId: randomUUID(),
  state: 'pending',
  reviewedByUserId: null,
  reviewedAt: null,
  rejectionCode: null,
  consumedAt: null,
  createdAt: new Date('2026-10-15T10:00:00Z'),
};
it('CHG-008 / SEC-003: Owner metadata excludes file references and customer identifiers', () => {
  const metadata = ownerDocumentState(row);
  expect(Object.keys(metadata).sort()).toEqual(
    [
      'id',
      'branchId',
      'bookingId',
      'kind',
      'state',
      'createdAt',
      'reviewedAt',
      'rejectionCode',
    ].sort(),
  );
  expect(JSON.stringify(metadata)).not.toContain(row.fileId);
  expect(JSON.stringify(metadata)).not.toContain(row.customerUserId);
});
it('SEC-003: own projection includes private reference and consumption state', () => {
  const consumedAt = new Date('2026-10-15T11:00:00Z');
  expect(ownDocumentState({ ...row, consumedAt })).toMatchObject({
    fileId: row.fileId,
    consumedAt: consumedAt.toISOString(),
    reviewedAt: null,
  });
});
it('BKG-001: final review timestamps are serialized and invalid provenance rejected', () => {
  const reviewedAt = new Date('2026-10-15T11:00:00Z');
  expect(ownerDocumentState({ ...row, state: 'accepted', reviewedAt })).toHaveProperty(
    'reviewedAt',
    reviewedAt.toISOString(),
  );
  expect(() => ownerDocumentState({ ...row, state: 'accepted' })).toThrow();
});
