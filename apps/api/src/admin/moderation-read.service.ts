import { and, desc, eq, lt, or } from 'drizzle-orm';
import { moderationActions, reports, reviews, users, type Database } from '@hsm/db';
import {
  DomainError,
  moderatedReviewPageSchema,
  moderatedReviewQuerySchema,
  moderationHistoryPageSchema,
  moderationHistoryPosition,
  moderationHistoryQuerySchema,
  moderationReportQuerySchema,
  moderationReviewSchema,
  reviewReportQueueSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockAdmin } from './scope.js';
const reviewFields = {
  reviewId: reviews.id,
  branchId: reviews.branchId,
  body: reviews.body,
  status: reviews.status,
  moderationReason: reviews.moderationReason,
  version: reviews.version,
  createdAt: reviews.createdAt,
  editedAt: reviews.editedAt,
};
type ReviewRow = {
  reviewId: string;
  branchId: string;
  body: string | null;
  status: 'published' | 'hidden' | 'removed';
  moderationReason: string | null;
  version: number;
  createdAt: Date;
  editedAt: Date | null;
};
function projectReview(row: ReviewRow) {
  return moderationReviewSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  });
}
async function findReview(tx: Transaction, reviewId: string) {
  const [row] = await tx.select(reviewFields).from(reviews).where(eq(reviews.id, reviewId));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
  return row;
}
// REV-006 / SEC-003: every page requires live moderation authority; no private author identity.
export class ModerationReadService {
  constructor(
    private readonly database: Database,
    private readonly clock = () => new Date(),
  ) {}
  reports(actor: Actor, query: unknown) {
    const input = moderationReportQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      const rows = await tx
        .select({ report: reports, review: reviews })
        .from(reports)
        .innerJoin(reviews, eq(reviews.id, reports.targetId))
        .where(
          and(
            eq(reports.targetType, 'review'),
            eq(reports.status, input.reportStatus),
            input.reviewStatus ? eq(reviews.status, input.reviewStatus) : undefined,
            input.reviewId ? eq(reviews.id, input.reviewId) : undefined,
            input.cursor ? lt(reports.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(reports.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return reviewReportQueueSchema.parse({
        data: page.map(({ report, review }) => ({
          reportId: report.id,
          reviewId: review.id,
          branchId: review.branchId,
          reason: report.reason,
          details: report.details,
          status: report.status,
          reviewStatus: review.status,
          reviewBody: review.body,
          reviewVersion: review.version,
          createdAt: report.createdAt.toISOString(),
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.report.id ?? null) : null,
      });
    });
  }
  reviews(actor: Actor, query: unknown) {
    const input = moderatedReviewQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      const rows = await tx
        .select(reviewFields)
        .from(reviews)
        .where(
          and(
            eq(reviews.status, input.status),
            input.cursor ? lt(reviews.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(reviews.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return moderatedReviewPageSchema.parse({
        data: page.map(projectReview),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.reviewId ?? null) : null,
      });
    });
  }
  detail(actor: Actor, reviewId: unknown) {
    const review = stayIdentifierSchema.parse(reviewId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      return projectReview(await findReview(tx, review));
    });
  }
  history(actor: Actor, reviewId: unknown, query: unknown) {
    const review = stayIdentifierSchema.parse(reviewId),
      input = moderationHistoryQuerySchema.parse(query);
    const position = input.cursor ? moderationHistoryPosition(input.cursor) : undefined;
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      await findReview(tx, review);
      const rows = await tx
        .select({
          id: moderationActions.id,
          action: moderationActions.action,
          reviewerName: users.fullName,
          reason: moderationActions.reason,
          reportId: moderationActions.reportId,
          createdAt: moderationActions.createdAt,
        })
        .from(moderationActions)
        .innerJoin(users, eq(users.id, moderationActions.adminUserId))
        .where(
          and(
            eq(moderationActions.targetType, 'review'),
            eq(moderationActions.targetId, review),
            position
              ? or(
                  lt(moderationActions.createdAt, new Date(position.createdAt)),
                  and(
                    eq(moderationActions.createdAt, new Date(position.createdAt)),
                    lt(moderationActions.id, position.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit),
        last = page.at(-1);
      return moderationHistoryPageSchema.parse({
        data: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        nextCursor:
          rows.length > input.limit && last ? last.createdAt.toISOString() + '|' + last.id : null,
      });
    });
  }
}
