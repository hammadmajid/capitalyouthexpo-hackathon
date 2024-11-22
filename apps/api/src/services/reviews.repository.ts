import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { reviewRatings, reviewReplies, reviews, users } from '@hsm/db';
import {
  DomainError,
  ownReviewSchema,
  publicReviewSchema,
  reviewCategorySchema,
  reviewRatingsSchema,
  staffReviewSchema,
  type ReviewRatings,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Reader = Pick<Transaction, 'select'>;
type Review = typeof reviews.$inferSelect;
type Joined = { review: Review; fullName: string; reply: typeof reviewReplies.$inferSelect | null };
// Only the reviewer's first name is ever shown (no surname, contact, room or money).
function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0]?.slice(0, 40) || 'Resident';
}
async function ratingsOf(tx: Reader, ids: string[]) {
  const map = new Map<string, Record<string, number>>();
  if (!ids.length) return map;
  const rows = await tx
    .select()
    .from(reviewRatings)
    .where(inArray(reviewRatings.reviewId, ids))
    .limit(ids.length * 9);
  for (const row of rows)
    map.set(row.reviewId, { ...(map.get(row.reviewId) ?? {}), [row.category]: row.rating });
  return map;
}
function reply(row: Joined) {
  return row.reply
    ? {
        body: row.reply.body,
        createdAt: row.reply.createdAt.toISOString(),
        editedAt: row.reply.editedAt?.toISOString() ?? null,
      }
    : null;
}
function shared(row: Joined, ratings: Record<string, number> | undefined) {
  return {
    id: row.review.id,
    reviewerName: firstName(row.fullName),
    ratings: reviewRatingsSchema.parse(ratings),
    body: row.review.body,
    createdAt: row.review.createdAt.toISOString(),
    editedAt: row.review.editedAt?.toISOString() ?? null,
    reply: reply(row),
  };
}
function joined(tx: Reader) {
  return tx
    .select({ review: reviews, fullName: users.fullName, reply: reviewReplies })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .leftJoin(reviewReplies, eq(reviewReplies.reviewId, reviews.id));
}
// REV-001..006: review reads. Callers prove Stay, branch or public listing scope first.
export class ReviewRepository {
  async own(tx: Reader, stayId: string) {
    const [row] = await joined(tx).where(eq(reviews.stayId, stayId));
    if (!row) return null;
    const ratings = await ratingsOf(tx, [row.review.id]);
    return ownReviewSchema.parse({
      ...shared(row, ratings.get(row.review.id)),
      stayId: row.review.stayId,
      status: row.review.status,
      moderationReason: row.review.moderationReason,
      version: row.review.version,
    });
  }
  async page(
    tx: Reader,
    branchId: string,
    view: 'public' | 'staff',
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await joined(tx)
      .where(
        and(
          eq(reviews.branchId, branchId),
          view === 'public' ? eq(reviews.status, 'published') : undefined,
          cursor ? lt(reviews.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(reviews.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit),
      ratings = await ratingsOf(
        tx,
        page.map((row) => row.review.id),
      );
    const data = page.map((row) =>
      view === 'public'
        ? publicReviewSchema.parse({
            ...shared(row, ratings.get(row.review.id)),
            verifiedStay: true,
          })
        : staffReviewSchema.parse({
            ...shared(row, ratings.get(row.review.id)),
            status: row.review.status,
            moderationReason: row.review.moderationReason,
            version: row.review.version,
          }),
    );
    return { data, nextCursor: rows.length > limit ? (page.at(-1)?.review.id ?? null) : null };
  }
  // p.35 rating aggregation: only published reviews count; one source, computed on read.
  async summary(tx: Reader, branchId: string) {
    const rows = await tx
      .select({
        category: reviewRatings.category,
        average: sql<number>`round(avg(${reviewRatings.rating})::numeric, 2)::float8`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewRatings)
      .innerJoin(reviews, eq(reviews.id, reviewRatings.reviewId))
      .where(and(eq(reviews.branchId, branchId), eq(reviews.status, 'published')))
      .groupBy(reviewRatings.category)
      .orderBy(asc(reviewRatings.category));
    const count = rows.find((row) => row.category === 'overall')?.count ?? 0;
    return {
      count,
      averages: count
        ? Object.fromEntries(
            reviewCategorySchema.options.map((key) => [
              key,
              rows.find((row) => row.category === key)?.average ?? 1,
            ]),
          )
        : null,
    };
  }
  async lock(tx: Transaction, reviewId: string) {
    const [row] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
    return row;
  }
  async writeRatings(tx: Transaction, reviewId: string, ratings: ReviewRatings) {
    await tx.delete(reviewRatings).where(eq(reviewRatings.reviewId, reviewId));
    await tx.insert(reviewRatings).values(
      Object.entries(ratings).map(([category, rating]) => ({
        reviewId,
        category: category as (typeof reviewCategorySchema.options)[number],
        rating,
      })),
    );
  }
  async currentRatings(tx: Reader, reviewId: string) {
    return (await ratingsOf(tx, [reviewId])).get(reviewId) ?? {};
  }
}
