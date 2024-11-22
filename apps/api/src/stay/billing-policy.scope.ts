import { and, eq, isNull, or } from 'drizzle-orm';
import { billingPolicies, roomTypes } from '@hsm/db';
import { DomainError, type BillingSettingsTarget } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';

export async function billingSettingsScope(
  database: Transaction,
  actor: Actor,
  target: BillingSettingsTarget,
  clock: () => Date,
  ownerOnly = false,
) {
  await lockActor(database, actor, clock);
  const scope = await lockInventoryScope(database, actor, target.branchId, undefined, ownerOnly);
  await lockActor(database, actor, clock);
  if (target.roomTypeId !== undefined) {
    const [type] = await database
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, target.roomTypeId),
          eq(roomTypes.branchId, target.branchId),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('update');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
  }
  return scope;
}
export function localBillingScope(target: BillingSettingsTarget) {
  return and(
    eq(billingPolicies.branchId, target.branchId),
    target.roomTypeId === undefined
      ? isNull(billingPolicies.roomTypeId)
      : eq(billingPolicies.roomTypeId, target.roomTypeId),
  );
}
export function billingLineageScope(target: BillingSettingsTarget, brandId: string) {
  return or(
    and(isNull(billingPolicies.brandId), isNull(billingPolicies.branchId)),
    eq(billingPolicies.brandId, brandId),
    and(
      eq(billingPolicies.branchId, target.branchId),
      or(
        isNull(billingPolicies.roomTypeId),
        target.roomTypeId === undefined
          ? undefined
          : eq(billingPolicies.roomTypeId, target.roomTypeId),
      ),
    ),
  );
}
