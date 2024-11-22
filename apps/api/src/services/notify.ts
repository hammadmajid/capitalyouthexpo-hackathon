import { eq } from 'drizzle-orm';
import { branches, notificationOutbox, organizations } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
// NTF-001: in-app notice written in the domain transaction; the unique dedupe key makes a
// retried command or worker delivery produce one notice per recipient and operation.
export async function notify(
  tx: Transaction,
  recipientUserId: string,
  event: string,
  operationId: string,
  now: Date,
) {
  await tx
    .insert(notificationOutbox)
    .values({
      eventType: 'notification.create',
      channel: 'in_app',
      recipientUserId,
      payload: { event, operationId },
      dedupeKey: 'in_app:' + recipientUserId + ':' + event + ':' + operationId,
      createdAt: now,
      nextAttemptAt: now,
    })
    .onConflictDoNothing();
}
export async function branchOwner(tx: Transaction, branchId: string) {
  const [row] = await tx
    .select({ ownerId: organizations.ownerUserId })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, branchId));
  return row?.ownerId ?? null;
}
