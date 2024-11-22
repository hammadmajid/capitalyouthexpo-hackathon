import { and, eq, isNull } from 'drizzle-orm';
import {
  brands,
  branches,
  organizations,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import { DomainError, type InventoryPermission } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';

export async function lockInventoryScope(
  database: Transaction,
  actor: Actor,
  branchId: string,
  permission?: InventoryPermission,
  ownerOnly = false,
) {
  const [scope] = await database
    .select({
      organizationId: branches.organizationId,
      brandId: branches.brandId,
      ownerId: organizations.ownerUserId,
    })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, branchId));
  if (!scope) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  const owner = scope.ownerId === actor.userId;
  if (!owner) {
    if (ownerOnly) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Owner scope required');
    const [assignment] = await database
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.branchId, branchId),
          eq(managerAssignments.userId, actor.userId),
          eq(managerAssignments.status, 'active'),
        ),
      )
      .for('update');
    if (!assignment) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
    if (permission) {
      const [grant] = await database
        .select({ permission: managerInventoryGrants.permission })
        .from(managerInventoryGrants)
        .where(
          and(
            eq(managerInventoryGrants.assignmentId, assignment.id),
            eq(managerInventoryGrants.permission, permission),
          ),
        );
      if (!grant) throw new DomainError('FORBIDDEN', 403, 'Management permission required');
    }
  }
  const [organization] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.ownerUserId, scope.ownerId),
        isNull(organizations.archivedAt),
      ),
    )
    .for('update');
  const [brand] = await database
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(
        eq(brands.id, scope.brandId),
        eq(brands.organizationId, scope.organizationId),
        isNull(brands.archivedAt),
      ),
    )
    .for('update');
  const [branch] = await database
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.id, branchId),
        eq(branches.organizationId, scope.organizationId),
        eq(branches.brandId, scope.brandId),
        isNull(branches.archivedAt),
      ),
    )
    .for('update');
  if (!organization || !brand || !branch)
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  return { ...scope, actorRole: owner ? 'owner' : 'manager' };
}
