import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  notificationOutbox,
  readResidentInvoiceBalance,
  residentRentPayloadSchema,
  stays,
  type Database,
} from '@hsm/db';
import type { ResidentRentLease } from './contracts.js';
import { NotificationProducer } from './producer.js';
type Row = typeof notificationOutbox.$inferSelect;
function karachiToday(now: Date) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now),
    );
}
function liveRow(row: Row | undefined, lease: ResidentRentLease, now: Date) {
  return Boolean(
    row &&
    row.status !== 'sent' &&
    row.status !== 'dead' &&
    row.leaseToken === lease.leaseToken &&
    row.leaseExpiresAt &&
    row.leaseExpiresAt > now &&
    row.channel === 'in_app' &&
    row.eventType === 'resident.rent' &&
    row.recipientUserId === null,
  );
}
// NTF-001/003 / RB-002: the Stay's own linked account only, and only while the authoritative
// balance still says the invoice is open (due) or past its agreed grace (overdue). A paid,
// voided or no-longer-linked case is acknowledged without a notice (suppression).
export function publishResidentRent(
  database: Database,
  lease: ResidentRentLease,
  requestedAt: Date,
  clock: () => Date,
) {
  return database.transaction(async (tx) => {
    const now = z.date().parse(new Date(Math.max(clock().getTime(), requestedAt.getTime())));
    const [row] = await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    if (!row || !liveRow(row, lease, now)) return false;
    const payload = residentRentPayloadSchema.safeParse(row.payload);
    if (
      !payload.success ||
      payload.data.event !== lease.payload.event ||
      payload.data.invoiceId !== lease.payload.invoiceId ||
      payload.data.stayId !== lease.payload.stayId
    )
      return false;
    const [stay] = await tx
      .select({ id: stays.id, branchId: stays.branchId, userId: stays.userId })
      .from(stays)
      .where(and(eq(stays.id, payload.data.stayId)))
      .limit(1);
    if (stay?.userId) {
      const balance = await readResidentInvoiceBalance(tx, {
        branchId: stay.branchId,
        stayId: stay.id,
        invoiceId: payload.data.invoiceId,
        today: karachiToday(now),
      });
      const open = ['issued', 'partially_paid', 'overdue'].includes(balance.state);
      const notify = payload.data.event === 'rent.due' ? open : balance.state === 'overdue';
      if (notify)
        await new NotificationProducer().enqueue(
          tx,
          {
            userId: stay.userId,
            event:
              payload.data.event === 'rent.due' ? 'resident.rent_due' : 'resident.rent_overdue',
            operationId: row.id,
          },
          now,
        );
    }
    await tx
      .update(notificationOutbox)
      .set({ status: 'sent', sentAt: now, lastError: null, leaseToken: null, leaseExpiresAt: null })
      .where(eq(notificationOutbox.id, row.id));
    return true;
  });
}
