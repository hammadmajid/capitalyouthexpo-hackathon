import { and, eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants } from '@hsm/db';
import { inventoryPermissionSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
export async function inventoryPermissions(
  database: Transaction,
  actor: Actor,
  branchId: string,
  owner: boolean,
) {
  if (owner)
    return { permissions: [...inventoryPermissionSchema.options], canConfigureManagers: true };
  const rows = await database
    .select({ permission: managerInventoryGrants.permission })
    .from(managerInventoryGrants)
    .innerJoin(managerAssignments, eq(managerAssignments.id, managerInventoryGrants.assignmentId))
    .where(
      and(
        eq(managerAssignments.userId, actor.userId),
        eq(managerAssignments.branchId, branchId),
        eq(managerAssignments.status, 'active'),
      ),
    )
    .orderBy(managerInventoryGrants.permission);
  return {
    permissions: rows.map((row) => inventoryPermissionSchema.parse(row.permission)),
    canConfigureManagers: false,
  };
}
