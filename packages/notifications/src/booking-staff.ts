import { and, eq, inArray } from 'drizzle-orm';
import { branches, managerAssignments, managerInventoryGrants, organizations } from '@hsm/db';
import type { NotificationTransaction } from './producer.js';
export type StaffGrant = 'booking_manage' | 'payment_record' | 'finance_view';
// CHG-010: delegated upfront review needs booking, payment-record and finance-read grants.
export const reviewGrants: StaffGrant[] = ['booking_manage', 'payment_record', 'finance_view'];
// NTF-002 / ACC-002: the branch Owner plus active Managers holding every required grant.
export async function bookingStaff(
  transaction: NotificationTransaction,
  branchId: string,
  grants: StaffGrant[],
) {
  const [owner] = await transaction
    .select({ userId: organizations.ownerUserId })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, branchId))
    .limit(1);
  if (!owner) return undefined;
  const rows = await transaction
    .select({ userId: managerAssignments.userId, permission: managerInventoryGrants.permission })
    .from(managerAssignments)
    .innerJoin(
      managerInventoryGrants,
      eq(managerInventoryGrants.assignmentId, managerAssignments.id),
    )
    .where(
      and(
        eq(managerAssignments.branchId, branchId),
        eq(managerAssignments.status, 'active'),
        inArray(managerInventoryGrants.permission, grants),
      ),
    );
  const managers = [...new Set(rows.map((row) => row.userId))].filter((userId) =>
    grants.every((grant) => rows.some((row) => row.userId === userId && row.permission === grant)),
  );
  return [...new Set([owner.userId, ...managers])].sort();
}
// Final eligibility: authority is rechecked when the queued staff notice is delivered.
export async function bookingStaffEligible(
  transaction: NotificationTransaction,
  userId: string,
  branchId: string,
  grants: StaffGrant[],
) {
  return (await bookingStaff(transaction, branchId, grants))?.includes(userId) ?? false;
}
