import { eq } from 'drizzle-orm';
import { branches, managerInventoryGrants } from '@hsm/db';
import { DomainError, inventoryPermissionSchema } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
// CHG-029: a Manager runs the whole branch. On activation the assignment receives every
// branch operation permission, in the activation transaction, and the grant is audited.
// Owner-only actions (managing managers, payment reversal, policy saves) stay role-checked.
// CHG-039: staff and payroll grants stay off until the owning Owner turns them on.
export const FULL_BRANCH_PERMISSIONS = inventoryPermissionSchema.options.filter(
  (permission) => permission !== 'staff_manage' && permission !== 'staff_payroll_manage',
);
export async function grantFullBranchAccess(
  transaction: Transaction,
  input: { assignmentId: string; branchId: string; managerUserId: string; now: Date },
  audit = new AuditWriter(),
) {
  const [branch] = await transaction
    .select({ organizationId: branches.organizationId })
    .from(branches)
    .where(eq(branches.id, input.branchId))
    .limit(1);
  if (!branch) throw new DomainError('INTERNAL', 500, 'Branch unavailable');
  await transaction
    .insert(managerInventoryGrants)
    .values(
      FULL_BRANCH_PERMISSIONS.map((permission) => ({
        assignmentId: input.assignmentId,
        permission,
        grantedAt: input.now,
      })),
    )
    .onConflictDoNothing();
  await audit.hostel(transaction, {
    actorUserId: input.managerUserId,
    actorRole: 'self',
    organizationId: branch.organizationId,
    branchId: input.branchId,
    action: 'manager.inventory_permissions.granted',
    targetType: 'manager_assignment',
    targetId: input.assignmentId,
    before: { permissions: [] },
    after: { permissions: [...FULL_BRANCH_PERMISSIONS] },
    createdAt: input.now,
  });
}
