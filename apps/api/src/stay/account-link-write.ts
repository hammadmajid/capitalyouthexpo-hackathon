import { and, eq, isNull } from 'drizzle-orm';
import { residentAccountLinks, residents, stays, stayHistory } from '@hsm/db';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { lockedOfflineStay } from './account-link-match.js';

type Target = NonNullable<Awaited<ReturnType<typeof lockedOfflineStay>>>;
export async function writeAccountLink(
  tx: Transaction,
  target: Target,
  userId: string,
  audit: { actorUserId: string; actorRole: string; organizationId: string },
  method: 'email' | 'hostel_approval',
  now: Date,
) {
  await tx
    .update(residents)
    .set({ userId, updatedAt: now })
    .where(and(eq(residents.id, target.resident.id), isNull(residents.userId)));
  await tx
    .update(stays)
    .set({ userId, version: target.stay.version + 1, updatedAt: now })
    .where(eq(stays.id, target.stay.id));
  await tx.insert(stayHistory).values({
    branchId: target.stay.branchId,
    stayId: target.stay.id,
    actorUserId: audit.actorUserId,
    previousState: target.stay.state,
    nextState: target.stay.state,
    reasonCode: 'resident.account_linked',
    detail: { userId, method },
    createdAt: now,
  });
  await tx
    .update(residentAccountLinks)
    .set({ status: 'expired', decidedAt: now })
    .where(
      and(
        eq(residentAccountLinks.stayId, target.stay.id),
        eq(residentAccountLinks.status, 'pending'),
      ),
    );
  await new AuditWriter().hostel(tx, {
    ...audit,
    branchId: target.stay.branchId,
    action: 'resident.account_linked',
    targetType: 'resident',
    targetId: target.resident.id,
    after: { userId, method },
    createdAt: now,
  });
}
