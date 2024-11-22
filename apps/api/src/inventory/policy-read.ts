import { and, eq, isNull, or } from 'drizzle-orm';
import { bookingPolicies } from '@hsm/db';
import {
  bookingPolicyReadSchema,
  bookingPolicyOverrideSchema,
  bookingPlatformLimitsSchema,
  resolveBookingPolicy,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import type { PolicyTarget } from './policy.repository.js';
import { policyReadScope } from './policy-read.scope.js';
type Row = typeof bookingPolicies.$inferSelect;
type Scope = Awaited<ReturnType<typeof policyReadScope>>;
function reference(row: Row) {
  const level = row.roomTypeId
    ? 'room_type'
    : row.branchId
      ? 'branch'
      : row.brandId
        ? 'hostel'
        : 'platform';
  return { id: row.id, level, scopeId: row.roomTypeId ?? row.branchId ?? row.brandId };
}
function applicablePolicies(database: Transaction, scope: Scope) {
  return database
    .select()
    .from(bookingPolicies)
    .where(
      and(
        eq(bookingPolicies.isCurrent, true),
        or(
          and(
            isNull(bookingPolicies.brandId),
            isNull(bookingPolicies.branchId),
            isNull(bookingPolicies.roomTypeId),
          ),
          scope.brandId
            ? and(
                eq(bookingPolicies.brandId, scope.brandId),
                isNull(bookingPolicies.branchId),
                isNull(bookingPolicies.roomTypeId),
              )
            : undefined,
          scope.branchId
            ? and(eq(bookingPolicies.branchId, scope.branchId), isNull(bookingPolicies.roomTypeId))
            : undefined,
          scope.typeId && scope.branchId
            ? and(
                eq(bookingPolicies.roomTypeId, scope.typeId),
                eq(bookingPolicies.branchId, scope.branchId),
              )
            : undefined,
        ),
      ),
    )
    .orderBy(bookingPolicies.id);
}
function localPolicy(target: PolicyTarget, platform: Row, layers: readonly Row[]) {
  if (target.level === 'platform') return platform;
  return layers.find((row) => {
    const version = reference(row);
    return version.level === target.level && version.scopeId === target.id;
  });
}
function resolvedSettings(platform: Row, rows: readonly Row[], scope: Scope, target: PolicyTarget) {
  const hostel = rows.find(
    (row) => scope.brandId !== null && row.brandId === scope.brandId && row.branchId === null,
  );
  const branch = rows.find(
    (row) => scope.branchId !== null && row.branchId === scope.branchId && row.roomTypeId === null,
  );
  const type = rows.find(
    (row) =>
      scope.typeId !== null && row.roomTypeId === scope.typeId && row.branchId === scope.branchId,
  );
  const layers = [hostel, branch, type].filter((row) => row !== undefined);
  const local = localPolicy(target, platform, layers),
    limits = bookingPlatformLimitsSchema.parse(platform.platformLimits);
  const resolve = (values: readonly Row[]) =>
    resolveBookingPolicy(
      platform.policy,
      values.map((row) => row.policy),
      limits,
    );
  return {
    localVersion: local ? reference(local) : null,
    overrides:
      target.level === 'platform' || !local
        ? null
        : bookingPolicyOverrideSchema.parse(local.policy),
    inherited:
      target.level === 'platform' ? null : resolve(layers.filter((row) => row.id !== local?.id)),
    effective: resolve(layers),
    limits,
    lineage: [platform, ...layers].map(reference),
  };
}
// BKG-006: one statement reads all applicable current layers; resolution reuses quote rules.
export async function readBookingPolicy(
  database: Transaction,
  actor: Actor,
  target: PolicyTarget,
  clock: () => Date,
) {
  await lockActor(database, actor, clock);
  const scope = await policyReadScope(database, actor, target);
  await lockActor(database, actor, clock);
  const rows = await applicablePolicies(database, scope);
  const descriptor = {
    level: target.level,
    scopeId: target.level === 'platform' ? null : target.id,
  };
  const platform = rows.find(
    (row) => row.brandId === null && row.branchId === null && row.roomTypeId === null,
  );
  if (!platform)
    return bookingPolicyReadSchema.parse({
      configured: false,
      target: descriptor,
      canEdit: scope.canEdit,
    });
  return bookingPolicyReadSchema.parse({
    configured: true,
    target: descriptor,
    canEdit: scope.canEdit,
    ...resolvedSettings(platform, rows, scope, target),
  });
}
