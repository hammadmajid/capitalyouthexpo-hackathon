import { expect, it } from 'vitest';
import {
  bookingDocumentSubmissionSchema,
  bookingDocumentReviewSchema,
  ownerBookingDocumentSchema,
  ownBookingDocumentSchema,
  ownerBookingDocumentPageSchema,
  ownBookingDocumentPageSchema,
} from './booking-documents.js';
const id = '11111111-1111-4111-8111-111111111111';
const state = {
  id,
  branchId: id,
  bookingId: null,
  kind: 'student_id',
  state: 'pending',
  createdAt: '2026-10-15T10:00:00Z',
  reviewedAt: null,
  rejectionCode: null,
};
it('CHG-008 / SEC-003: submission explicitly shares an approved private document type with the Owner', () => {
  const submission = { kind: 'student_id', fileId: id, shareWithOwner: true };
  expect(bookingDocumentSubmissionSchema.parse(submission)).toEqual(submission);
  for (const change of [
    { shareWithOwner: false },
    { shareWithOwner: undefined },
    { kind: 'medical_record' },
    { customerUserId: id },
    { state: 'accepted' },
    { consumedAt: '2026-10-15T10:00:00Z' },
  ])
    expect(bookingDocumentSubmissionSchema.safeParse({ ...submission, ...change }).success).toBe(
      false,
    );
});
it('SEC-003: review decisions are closed and cannot claim an actor, timestamp or arbitrary private reason', () => {
  expect(bookingDocumentReviewSchema.parse({ state: 'accepted' })).toEqual({ state: 'accepted' });
  expect(
    bookingDocumentReviewSchema.parse({ state: 'rejected', rejectionCode: 'wrong_document' }).state,
  ).toBe('rejected');
  for (const value of [
    { state: 'pending' },
    { state: 'rejected' },
    { state: 'rejected', rejectionCode: 'sensitive free text' },
    { state: 'accepted', reviewedByUserId: id },
    { state: 'accepted', rejectionCode: 'other' },
  ])
    expect(bookingDocumentReviewSchema.safeParse(value).success).toBe(false);
});
it('CHG-008: Owner metadata excludes raw file/customer references; own metadata supports safe evidence selection', () => {
  expect(ownerBookingDocumentSchema.parse(state)).toEqual(state);
  expect(ownerBookingDocumentSchema.safeParse({ ...state, fileId: id }).success).toBe(false);
  expect(ownerBookingDocumentSchema.safeParse({ ...state, customerUserId: id }).success).toBe(
    false,
  );
  const own = { ...state, fileId: id, consumedAt: null };
  expect(ownBookingDocumentSchema.parse(own)).toEqual(own);
  expect(
    ownerBookingDocumentPageSchema.parse({ data: [state], nextCursor: null }).data,
  ).toHaveLength(1);
  expect(ownBookingDocumentPageSchema.parse({ data: [own], nextCursor: null }).data).toHaveLength(
    1,
  );
});

it('BKG-001 / SEC-003: status cannot claim verification without provenance or consume rejected/booked evidence', () => {
  const reviewedAt = '2026-10-15T10:01:00Z';
  const accepted = { ...state, state: 'accepted', reviewedAt };
  expect(ownerBookingDocumentSchema.parse(accepted).state).toBe('accepted');
  for (const change of [
    { state: 'accepted' },
    { reviewedAt },
    { rejectionCode: 'other' },
    { state: 'rejected', reviewedAt },
  ])
    expect(ownerBookingDocumentSchema.safeParse({ ...state, ...change }).success).toBe(false);
  const own = { ...accepted, fileId: id, consumedAt: reviewedAt };
  expect(ownBookingDocumentSchema.parse(own).consumedAt).toBe(reviewedAt);
  expect(ownBookingDocumentSchema.safeParse({ ...own, bookingId: id }).success).toBe(false);
  expect(
    ownBookingDocumentSchema.safeParse({ ...own, state: 'rejected', rejectionCode: 'other' })
      .success,
  ).toBe(false);
  expect(ownBookingDocumentSchema.safeParse({ ...own, ...state }).success).toBe(true);
});
