import { and, eq } from 'drizzle-orm';
import {
  branches,
  managerAssignments,
  notificationOutbox,
  organizations,
  users,
  visitHistory,
  visitLifecyclePayloadSchema,
  visitRequests,
  visitInterestResponses,
  type Database,
} from '@hsm/db';
import { InvalidNotificationJob, type VisitLifecycleLease } from './contracts.js';
import { NotificationProducer, type NotificationTransaction } from './producer.js';
export async function visitRecipients(
  tx: NotificationTransaction,
  visitId: string,
  historyId: string,
  event: 'visit.changed' | 'visit.follow_up',
) {
  const [source] = await tx
    .select({
      customerUserId: visitRequests.customerUserId,
      branchId: visitRequests.branchId,
      status: visitHistory.status,
      action: visitHistory.action,
      followUpSentAt: visitRequests.followUpSentAt,
    })
    .from(visitHistory)
    .innerJoin(
      visitRequests,
      and(
        eq(visitRequests.id, visitHistory.visitId),
        eq(visitRequests.branchId, visitHistory.branchId),
      ),
    )
    .where(and(eq(visitHistory.id, historyId), eq(visitHistory.visitId, visitId)))
    .limit(1);
  if (!source) throw new InvalidNotificationJob();
  if (event === 'visit.follow_up') {
    if (source.status !== 'completed' || source.action !== 'complete' || !source.followUpSentAt)
      throw new InvalidNotificationJob();
    const [answered] = await tx
      .select({ id: visitInterestResponses.id })
      .from(visitInterestResponses)
      .where(
        and(
          eq(visitInterestResponses.visitId, visitId),
          eq(visitInterestResponses.branchId, source.branchId),
        ),
      )
      .limit(1);
    return answered ? [] : [source.customerUserId];
  }
  const [owner] = await tx
    .select({ id: organizations.ownerUserId })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, source.branchId))
    .limit(1);
  if (!owner) throw new InvalidNotificationJob();
  const managers = await tx
    .select({ id: managerAssignments.userId })
    .from(managerAssignments)
    .innerJoin(users, eq(users.id, managerAssignments.userId))
    .where(
      and(
        eq(managerAssignments.branchId, source.branchId),
        eq(managerAssignments.status, 'active'),
        eq(users.accountStatus, 'active'),
      ),
    );
  return [...new Set([source.customerUserId, owner.id, ...managers.map((row) => row.id)])].sort();
}
// NTF-002: source-bound history, recipients and lease acknowledgement commit together.
export function publishVisitLifecycle(
  db: Database,
  lease: VisitLifecycleLease,
  requestedAt: Date,
  clock: () => Date,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, lease.id))
      .for('update');
    const now = () => new Date(Math.max(requestedAt.getTime(), clock().getTime()));
    if (
      !row ||
      row.status === 'sent' ||
      row.status === 'dead' ||
      row.eventType !== 'visit.lifecycle' ||
      row.channel !== 'in_app' ||
      row.recipientUserId !== null ||
      row.leaseToken !== lease.leaseToken ||
      !row.leaseExpiresAt ||
      row.leaseExpiresAt <= now()
    )
      return false;
    const job = visitLifecyclePayloadSchema.safeParse(row.payload);
    if (
      !job.success ||
      job.data.visitId !== lease.payload.visitId ||
      job.data.historyId !== lease.payload.historyId ||
      job.data.event !== lease.payload.event
    )
      return false;
    const targets = await visitRecipients(tx, job.data.visitId, job.data.historyId, job.data.event),
      producer = new NotificationProducer();
    for (const userId of targets) {
      if (row.leaseExpiresAt <= now())
        throw new Error('Visit notice lease expired before publication');
      await producer.enqueue(
        tx,
        { userId, event: job.data.event, operationId: job.data.historyId },
        now(),
      );
    }
    if (row.leaseExpiresAt <= now())
      throw new Error('Visit notice lease expired before acknowledgement');
    await tx
      .update(notificationOutbox)
      .set({
        status: 'sent',
        sentAt: now(),
        lastError: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(notificationOutbox.id, row.id));
    return true;
  });
}
