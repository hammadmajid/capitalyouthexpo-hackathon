import { and, eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants } from '@hsm/db';
import { DomainError, inventoryMutationSchema, type InventoryPermission } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
export class InventoryGrantRepository {
  constructor(
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(database: Transaction, actor: Actor, branchId: string, assignmentId: string) {
    const [assignment] = await database
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(
        and(eq(managerAssignments.id, assignmentId), eq(managerAssignments.branchId, branchId)),
      )
      .for('update');
    await lockInventoryScope(database, actor, branchId, undefined, true);
    if (!assignment) throw new DomainError('NOT_FOUND', 404, 'Manager assignment unavailable');
    return true;
  }
  async save(
    database: Transaction,
    actor: Actor,
    branchId: string,
    assignmentId: string,
    permissions: readonly InventoryPermission[],
  ) {
    const scope = await lockInventoryScope(database, actor, branchId, undefined, true);
    const before = await database
      .select({ permission: managerInventoryGrants.permission })
      .from(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId))
      .orderBy(managerInventoryGrants.permission);
    await database
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    if (permissions.length)
      await database
        .insert(managerInventoryGrants)
        .values(
          permissions.map((permission) => ({ assignmentId, permission, grantedAt: this.clock() })),
        );
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: 'owner',
      organizationId: scope.organizationId,
      branchId,
      action: 'manager.inventory_permissions.changed',
      targetType: 'manager_assignment',
      targetId: assignmentId,
      before: { permissions: before.map((row) => row.permission) },
      after: { permissions: [...permissions] },
      createdAt: this.clock(),
    });
    return inventoryMutationSchema.parse({ id: assignmentId, branchId, kind: 'manager_grants' });
  }
}
