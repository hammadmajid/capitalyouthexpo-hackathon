import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  bookings,
  bookingHistory,
  bookingPaymentProofs,
  bookingUpfrontTerms,
  notificationOutbox,
  bookingLifecyclePayloadSchema,
  type BookingLifecycleEvent,
  type Database,
} from '@hsm/db';
import {
  InvalidNotificationJob,
  type BookingLifecycleLease,
  type NotificationEvent,
} from './contracts.js';
import { NotificationProducer, type NotificationTransaction } from './producer.js';
import { bookingStaff, reviewGrants } from './booking-staff.js';
type Row = typeof notificationOutbox.$inferSelect;
type LiveRow = Row & { leaseExpiresAt: Date; recipientUserId: null };
function freshNow(clock: () => Date, requestedAt: Date) {
  return z.date().parse(new Date(Math.max(clock().getTime(), requestedAt.getTime())));
}
function liveRow(row: Row | undefined, lease: BookingLifecycleLease, now: Date): row is LiveRow {
  return Boolean(
    row &&
    row.status !== 'sent' &&
    row.status !== 'dead' &&
    row.leaseToken === lease.leaseToken &&
    row.leaseExpiresAt &&
    row.leaseExpiresAt > now &&
    row.channel === 'in_app' &&
    row.eventType === 'booking.lifecycle' &&
    row.recipientUserId === null,
  );
}
type Target = { userId: string; event: NotificationEvent; operationId: string };
type Job = { event: BookingLifecycleEvent; bookingId: string; proofId?: string | undefined };
const stateEvents = {
  'booking.confirmed': 'confirmed',
  'booking.rejected': 'rejected',
  'booking.cancelled': 'cancelled',
  'booking.expired': 'expired',
} as const;
async function historyExists(transaction: NotificationTransaction, job: Job) {
  const condition =
    job.event === 'booking.submitted'
      ? and(
          isNull(bookingHistory.previousState),
          inArray(bookingHistory.nextState, ['pending_request', 'confirmed']),
        )
      : job.event in stateEvents
        ? eq(bookingHistory.nextState, stateEvents[job.event as keyof typeof stateEvents])
        : undefined;
  if (!condition) return false;
  const [history] = await transaction
    .select({ id: bookingHistory.id })
    .from(bookingHistory)
    .where(and(eq(bookingHistory.bookingId, job.bookingId), condition))
    .limit(1);
  return Boolean(history);
}
// SRS v2.11: upfront events are proven by their own immutable terms/proof records.
async function upfrontExists(transaction: NotificationTransaction, job: Job) {
  if (job.event === 'booking.approved') {
    const [terms] = await transaction
      .select({ approvedAt: bookingUpfrontTerms.approvedAt })
      .from(bookingUpfrontTerms)
      .where(eq(bookingUpfrontTerms.bookingId, job.bookingId));
    return Boolean(terms?.approvedAt);
  }
  if (!job.proofId) return false;
  const [proof] = await transaction
    .select({ state: bookingPaymentProofs.state })
    .from(bookingPaymentProofs)
    .where(
      and(
        eq(bookingPaymentProofs.id, job.proofId),
        eq(bookingPaymentProofs.bookingId, job.bookingId),
      ),
    );
  return job.event === 'booking.payment_rejected' ? proof?.state === 'rejected' : Boolean(proof);
}
async function recipients(transaction: NotificationTransaction, job: Job): Promise<Target[]> {
  const [booking] = await transaction
    .select({ customerUserId: bookings.customerUserId, branchId: bookings.branchId })
    .from(bookings)
    .where(eq(bookings.id, job.bookingId))
    .limit(1);
  const proven =
    job.event === 'booking.approved' ||
    job.event === 'booking.payment_submitted' ||
    job.event === 'booking.payment_rejected'
      ? await upfrontExists(transaction, job)
      : await historyExists(transaction, job);
  if (!booking || !proven) throw new InvalidNotificationJob();
  const operationId = job.proofId ?? job.bookingId;
  const result: Target[] = [{ userId: booking.customerUserId, event: job.event, operationId }];
  const staffEvent =
    job.event === 'booking.submitted'
      ? { event: 'booking.received' as const, grants: ['booking_manage' as const] }
      : job.event === 'booking.payment_submitted'
        ? { event: 'booking.payment_review' as const, grants: reviewGrants }
        : undefined;
  if (staffEvent) {
    const staff = await bookingStaff(transaction, booking.branchId, staffEvent.grants);
    if (!staff) throw new InvalidNotificationJob();
    for (const userId of staff) result.push({ userId, event: staffEvent.event, operationId });
  }
  return result;
}
async function queueTargets(
  transaction: NotificationTransaction,
  targets: Target[],
  expiresAt: Date,
  requestedAt: Date,
  clock: () => Date,
) {
  function activeTime() {
    const now = freshNow(clock, requestedAt);
    if (expiresAt <= now) throw new Error('Booking notice lease expired before publication');
    return now;
  }
  const producer = new NotificationProducer();
  for (const target of targets) await producer.enqueue(transaction, target, activeTime());
  return activeTime();
}
// NTF-002 / ACC-001: fanout and acknowledgement share one transaction, with no inventory locks.
export function publishBookingLifecycle(
  database: Database,
  lease: BookingLifecycleLease,
  requestedAt: Date,
  clock: () => Date,
) {
  return database.transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    if (!liveRow(row, lease, freshNow(clock, requestedAt))) return false;
    const job = bookingLifecyclePayloadSchema.safeParse(row.payload);
    if (
      !job.success ||
      job.data.event !== lease.payload.event ||
      job.data.bookingId !== lease.payload.bookingId ||
      job.data.proofId !== lease.payload.proofId
    )
      return false;
    const targets = await recipients(transaction, job.data);
    const now = await queueTargets(transaction, targets, row.leaseExpiresAt, requestedAt, clock);
    await transaction
      .update(notificationOutbox)
      .set({ status: 'sent', sentAt: now, lastError: null, leaseToken: null, leaseExpiresAt: null })
      .where(eq(notificationOutbox.id, row.id));
    return true;
  });
}
