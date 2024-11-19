import { expect, it } from 'vitest';
import {
  moderatedReviewQuerySchema,
  moderationHistoryPosition,
  moderationHistoryQuerySchema,
  moderationReportQuerySchema,
  moderationReviewSchema,
} from './admin-moderation.js';
const id = '10000000-0000-4000-8000-000000000001';
const createdAt = '2026-10-30T04:00:00.000Z';
it('REV-006: restoration/report filters are closed, bounded and have honest defaults', () => {
  expect(moderatedReviewQuerySchema.parse({})).toEqual({ status: 'hidden', limit: 20 });
  expect(
    moderationReportQuerySchema.parse({ reportStatus: 'dismissed', reviewStatus: 'removed' }),
  ).toMatchObject({ reportStatus: 'dismissed', reviewStatus: 'removed' });
  for (const body of [
    { status: 'any' },
    { limit: 0 },
    { limit: 51 },
    { cursor: 'bad' },
    { authorId: id },
  ])
    expect(moderatedReviewQuerySchema.safeParse(body).success).toBe(false);
});
it('AUD-003 REV-006: history cursor validates exact timestamp and UUID pair', () => {
  expect(moderationHistoryPosition(createdAt + '|' + id)).toEqual({ createdAt, id });
  for (const cursor of ['bad', createdAt + '|bad', 'bad|' + id, createdAt + '|' + id + '|'])
    expect(moderationHistoryQuerySchema.safeParse({ cursor }).success).toBe(false);
});
it('SEC-003 REV-006: review DTO rejects account identifiers and unknown private fields', () => {
  const review = {
    reviewId: id,
    branchId: id,
    body: null,
    status: 'hidden',
    moderationReason: 'Policy',
    version: 2,
    createdAt,
    editedAt: null,
  };
  expect(moderationReviewSchema.parse(review)).toEqual(review);
  expect(moderationReviewSchema.safeParse({ ...review, authorUserId: id }).success).toBe(false);
  expect(moderationReviewSchema.safeParse({ ...review, cnic: 'private' }).success).toBe(false);
});
