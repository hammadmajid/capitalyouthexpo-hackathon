import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { residentLifecyclePayloadSchema, notificationOutbox, type Database } from '@hsm/db';
import type { ResidentLifecycleLease } from './contracts.js';
import { residentLifecycleTargets } from './resident-targets.js';
import { NotificationProducer, type NotificationTransaction } from './producer.js';
type Row = typeof notificationOutbox.$inferSelect;
type LiveRow = Row & { leaseExpiresAt: Date; recipientUserId: null };
function freshNow(clock: () => Date, requestedAt: Date) {
  return z.date().parse(new Date(Math.max(clock().getTime(), requestedAt.getTime())));
}
function liveRow(row: Row | undefined, lease: ResidentLifecycleLease, now: Date): row is LiveRow {
  return Boolean(
    row &&
    row.status !== 'sent' &&
    row.status !== 'dead' &&
    row.leaseToken === lease.leaseToken &&
    row.leaseExpiresAt &&
    row.leaseExpiresAt > now &&
    row.channel === 'in_app' &&
    row.eventType === 'resident.lifecycle' &&
    row.recipientUserId === null,
  );
}
async function queueTargets(
  tx: NotificationTransaction,
  targets: Awaited<ReturnType<typeof residentLifecycleTargets>>,
  historyId: string,
  expiresAt: Date,
  requestedAt: Date,
  clock: () => Date,
) {
  function activeTime() {
    const now = freshNow(clock, requestedAt);
    if (expiresAt <= now) throw Error('Resident notice lease expired before publication');
    return now;
  }
  const producer = new NotificationProducer();
  for (const target of targets)
    await producer.enqueue(tx, { ...target, operationId: historyId }, activeTime());
  return activeTime();
}
// NTF-002 / ACC-004: source validation, ordered recipient jobs and acknowledgement
// share one transaction; no inventory lock is acquired by notification fanout.
export function publishResidentLifecycle(
  database: Database,
  lease: ResidentLifecycleLease,
  requestedAt: Date,
  clock: () => Date,
) {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    if (!liveRow(row, lease, freshNow(clock, requestedAt))) return false;
    const parsed = residentLifecyclePayloadSchema.safeParse(row.payload);
    if (
      !parsed.success ||
      parsed.data.event !== lease.payload.event ||
      parsed.data.stayId !== lease.payload.stayId ||
      parsed.data.historyId !== lease.payload.historyId
    )
      return false;
    const targets = await residentLifecycleTargets(tx, parsed.data, freshNow(clock, requestedAt));
    const now = await queueTargets(
      tx,
      targets,
      parsed.data.historyId,
      row.leaseExpiresAt,
      requestedAt,
      clock,
    );
    await tx
      .update(notificationOutbox)
      .set({ status: 'sent', sentAt: now, lastError: null, leaseToken: null, leaseExpiresAt: null })
      .where(eq(notificationOutbox.id, row.id));
    return true;
  });
}
