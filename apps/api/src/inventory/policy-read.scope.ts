import { and, eq, isNull } from 'drizzle-orm';
import { adminAccounts, roomTypes } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { ScopeRepository } from '../authorization/repository.js';
import { lockSetupScope } from '../management/hostel-setup.scope.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import type { PolicyTarget } from './policy.repository.js';
export async function policyReadScope(database: Transaction, actor: Actor, target: PolicyTarget) {
  if (target.level === 'platform') {
    const [root] = await database
      .select({ id: adminAccounts.userId })
      .from(adminAccounts)
      .where(
        and(
          eq(adminAccounts.userId, actor.userId),
          eq(adminAccounts.isRoot, true),
          eq(adminAccounts.status, 'active'),
        ),
      )
      .for('share');
    const role = await new ScopeRepository(database).admin(actor.userId);
    if (!root || !role?.isRoot) throw new DomainError('FORBIDDEN', 403, 'Root scope required');
    return { brandId: null, branchId: null, typeId: null, canEdit: true };
  }
  if (target.level === 'hostel') {
    await lockSetupScope(database, actor, { kind: 'brand', id: target.id });
    return { brandId: target.id, branchId: null, typeId: null, canEdit: true };
  }
  const branchId = target.level === 'branch' ? target.id : target.branchId;
  if (!branchId) throw new DomainError('NOT_FOUND', 404, 'Policy scope unavailable');
  const scope = await lockInventoryScope(database, actor, branchId);
  if (target.level === 'room_type') {
    const [type] = await database
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, target.id),
          eq(roomTypes.branchId, branchId),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('share');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
  }
  const access = await inventoryPermissions(database, actor, branchId, scope.actorRole === 'owner');
  return {
    brandId: scope.brandId,
    branchId,
    typeId: target.level === 'room_type' ? target.id : null,
    canEdit: access.permissions.includes('policy_edit'),
  };
}
