import {
  moderatedReviewPageSchema,
  moderatedReviewQuerySchema,
  moderationHistoryPageSchema,
  moderationHistoryQuerySchema,
  moderationReportQuerySchema,
  moderationReviewSchema,
  reviewReportQueueSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const queryValues = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
// REV-006 / SEC-003: use the existing bearer/cookie middleware; never a separate unbound fetch.
export function listModerationReports(client: ApiClient, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/moderation/reports', {
      params: { query: queryValues(moderationReportQuerySchema.parse(query)) },
    }),
    reviewReportQueueSchema,
  );
}
export function listModeratedReviews(client: ApiClient, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/moderation/reviews', {
      params: { query: queryValues(moderatedReviewQuerySchema.parse(query)) },
    }),
    moderatedReviewPageSchema,
  );
}
export function readModerationReview(client: ApiClient, reviewId: unknown) {
  const target = stayIdentifierSchema.parse(reviewId);
  return readApi(
    client.GET('/v1/admin/moderation/reviews/{reviewId}', {
      params: { path: { reviewId: target } },
    }),
    moderationReviewSchema,
  ).then((review) => {
    if (review.reviewId !== target) throw new ClientFailure('INVALID_RESPONSE');
    return review;
  });
}
export function readModerationHistory(client: ApiClient, reviewId: unknown, query: unknown = {}) {
  return readApi(
    client.GET('/v1/admin/moderation/reviews/{reviewId}/history', {
      params: {
        path: { reviewId: stayIdentifierSchema.parse(reviewId) },
        query: queryValues(moderationHistoryQuerySchema.parse(query)),
      },
    }),
    moderationHistoryPageSchema,
  );
}
