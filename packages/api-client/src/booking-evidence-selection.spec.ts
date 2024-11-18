import { expect, it } from 'vitest';
import { ownBookingDocumentSchema } from '@hsm/contracts';
import {
  selectableBookingEvidence,
  bookingEvidenceReviewState,
} from './booking-evidence-selection.js';
const id = '019a1234-1234-7123-8123-123456789abc';
function evidence(values: object = {}) {
  return ownBookingDocumentSchema.parse({
    id,
    branchId: id,
    bookingId: null,
    fileId: id,
    kind: 'student_id',
    state: 'accepted',
    createdAt: '2026-10-15T09:00:00Z',
    reviewedAt: '2026-10-15T10:00:00Z',
    consumedAt: null,
    rejectionCode: null,
    ...values,
  });
}
it('BKG-001: fresh accepted evidence is usable once even when historical reuse is disabled', () => {
  const fresh = evidence();
  expect(selectableBookingEvidence([fresh], 'student_id', false)).toEqual([fresh]);
  expect(selectableBookingEvidence([fresh], 'cnic', true)).toEqual([]);
});
it('BKG-001: consumed and booking-attached history requires policy reuse permission', () => {
  for (const row of [
    evidence({ consumedAt: '2026-10-15T11:00:00Z' }),
    evidence({ bookingId: id }),
  ]) {
    expect(selectableBookingEvidence([row], 'student_id', false)).toEqual([]);
    expect(selectableBookingEvidence([row], 'student_id', true)).toEqual([row]);
  }
});
it('SEC-003: a later rejected review wins even when an older accepted row is returned first', () => {
  const accepted = evidence();
  const rejected = evidence({
    state: 'rejected',
    reviewedAt: '2026-10-15T11:00:00Z',
    rejectionCode: 'unreadable',
  });
  expect(selectableBookingEvidence([accepted, rejected], 'student_id', true)).toEqual([]);
  expect(bookingEvidenceReviewState([accepted, rejected], 'student_id', id)).toBe('rejected');
});
it('SEC-003: rejection wins a review-time tie and a later valid fresh acceptance can replace it', () => {
  const accepted = evidence();
  const rejected = evidence({ state: 'rejected', rejectionCode: 'unreadable' });
  expect(selectableBookingEvidence([accepted, rejected], 'student_id', true)).toEqual([]);
  const fresh = evidence({ reviewedAt: '2026-10-15T12:00:00Z' });
  expect(selectableBookingEvidence([rejected, fresh], 'student_id', false)).toEqual([fresh]);
});
it('BKG-001: pending scanning or sharing never becomes accepted human review', () => {
  const pending = evidence({ state: 'pending', reviewedAt: null });
  expect(selectableBookingEvidence([pending], 'student_id', true)).toEqual([]);
  expect(bookingEvidenceReviewState([pending], 'student_id', id)).toBe('pending');
  expect(bookingEvidenceReviewState([], 'student_id', id)).toBeUndefined();
});
it('BKG-001: a newer pending submission does not silently discard a final accepted review', () => {
  const accepted = evidence({ bookingId: id });
  const pending = evidence({
    state: 'pending',
    reviewedAt: null,
    createdAt: '2026-10-15T12:00:00Z',
  });
  expect(selectableBookingEvidence([pending, accepted], 'student_id', true)).toEqual([accepted]);
  expect(bookingEvidenceReviewState([pending, accepted], 'student_id', id)).toBe('accepted');
});

it('BKG-001: equal review times retain a fresh one-use source over its later booking snapshot', () => {
  const fresh = evidence();
  const snapshot = evidence({
    id: '019a1234-1234-7123-8123-123456789abd',
    bookingId: id,
    createdAt: '2026-10-15T12:00:00Z',
  });
  expect(selectableBookingEvidence([fresh, snapshot], 'student_id', false)).toEqual([fresh]);
  expect(selectableBookingEvidence([snapshot, fresh], 'student_id', true)).toEqual([fresh]);
});
it('BKG-001: duplicate final snapshots use deterministic review, creation and identifier ordering', () => {
  const earlier = evidence({ bookingId: id });
  const later = evidence({ id: '019a1234-1234-7123-8123-123456789abd', bookingId: id });
  expect(selectableBookingEvidence([earlier, later], 'student_id', true)).toEqual([later]);
});
