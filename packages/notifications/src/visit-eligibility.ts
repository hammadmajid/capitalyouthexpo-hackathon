import { eq } from 'drizzle-orm';
import { lockInventoryBranch, visitHistory } from '@hsm/db';
import { InvalidNotificationJob } from './contracts.js';
import type { NotificationTransaction } from './producer.js';
import { visitRecipients } from './visit.repository.js';
// VISIT-001: the response writer uses this hierarchy lock too; no prompt can race an earlier answer.
export async function visitFollowUpEligible(
  tx: NotificationTransaction,
  userId: string,
  historyId: string,
) {
  const [source] = await tx
    .select({ visitId: visitHistory.visitId, branchId: visitHistory.branchId })
    .from(visitHistory)
    .where(eq(visitHistory.id, historyId));
  if (!source) throw new InvalidNotificationJob();
  await lockInventoryBranch(tx, source.branchId);
  return (await visitRecipients(tx, source.visitId, historyId, 'visit.follow_up')).includes(userId);
}
