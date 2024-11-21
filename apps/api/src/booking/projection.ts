import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  bookings,
  bookingDocuments,
  branches,
  brands,
  organizations,
  cities,
  stays,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  bookingPageSchema,
  type BranchBookingPageQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { bookingReference } from './policy.js';
import { upfrontProjections } from './upfront.js';
export async function bookingProjection(
  database: Transaction,
  booking: typeof bookings.$inferSelect,
  now: Date,
) {
  const documents = await database
    .select({ kind: bookingDocuments.kind, state: bookingDocuments.state })
    .from(bookingDocuments)
    .where(eq(bookingDocuments.bookingId, booking.id))
    .orderBy(bookingDocuments.kind);
  // STAY-001: stays_booking_uq allows at most one Stay per booking.
  const [stay] = await database
    .select({ id: stays.id, state: stays.state })
    .from(stays)
    .where(eq(stays.bookingId, booking.id))
    .limit(1);
  const expired =
    booking.state === 'pending_request' &&
    booking.requestExpiresAt !== null &&
    booking.requestExpiresAt <= now;
  return bookingSummarySchema.parse({
    id: booking.id,
    branchId: booking.branchId,
    reference: bookingReference(booking.id),
    state: expired ? 'expired' : booking.state,
    quote: bookingQuoteSnapshotSchema.parse(booking.quoteSnapshot),
    createdAt: booking.createdAt.toISOString(),
    requestExpiresAt: booking.requestExpiresAt?.toISOString() ?? null,
    documents,
    upfront: (await upfrontProjections(database, [booking.id])).get(booking.id) ?? null,
    stay: stay ?? null,
  });
}
export async function bookingPage(
  database: Transaction,
  scope: { customerUserId: string } | { branchId: string },
  page: BranchBookingPageQuery,
  now: Date,
) {
  const rows = await database
    .select()
    .from(bookings)
    .where(
      and(
        'customerUserId' in scope
          ? eq(bookings.customerUserId, scope.customerUserId)
          : eq(bookings.branchId, scope.branchId),
        page.cursor ? gt(bookings.id, page.cursor) : undefined,
        page.queue === 'pending_requests' ? eq(bookings.state, 'pending_request') : undefined,
      ),
    )
    .orderBy(bookings.id)
    .limit(page.limit + 1);
  const selected = rows.slice(0, page.limit);
  return bookingPageSchema.parse({
    data: await Promise.all(selected.map((row) => bookingProjection(database, row, now))),
    nextCursor: rows.length > page.limit ? selected.at(-1)?.id : null,
  });
}
export async function publicBranch(database: Transaction, branchId: string, lockCity = false) {
  const query = database
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(
      and(
        eq(branches.id, branchId),
        eq(cities.isActive, true),
        eq(branches.verificationStatus, 'approved'),
        isNull(branches.listingHiddenAt),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .limit(1);
  const [branch] = await (lockCity ? query.for('share', { of: cities }) : query);
  return branch;
}
