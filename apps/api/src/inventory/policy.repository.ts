import { readBookingPolicy } from './policy-read.js';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  bookingPolicies,
  branches,
  brands,
  roomTypes,
  adminAccounts,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  resolveBookingPolicy,
  bookingPolicyVersionSchema,
  bookingPlatformLimitsSchema,
  type BookingPolicyOverride,
  type BookingPolicy,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { ScopeRepository } from '../authorization/repository.js';
import { lockSetupScope } from '../management/hostel-setup.scope.js';
import { lockInventoryScope } from './scope.js';
type Limits = ReturnType<typeof bookingPlatformLimitsSchema.parse>;
export type PolicyTarget =
  | { level: 'platform' }
  | { level: 'hostel' | 'branch' | 'room_type'; id: string; branchId?: string };
function targetCondition(target: PolicyTarget): SQL | undefined {
  if (target.level === 'platform')
    return and(isNull(bookingPolicies.brandId), isNull(bookingPolicies.branchId));
  if (target.level === 'hostel') return eq(bookingPolicies.brandId, target.id);
  if (target.level === 'branch')
    return and(eq(bookingPolicies.branchId, target.id), isNull(bookingPolicies.roomTypeId));
  return and(
    eq(bookingPolicies.branchId, target.branchId ?? ''),
    eq(bookingPolicies.roomTypeId, target.id),
  );
}
export class BookingPolicyRepository {
  constructor(
    readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, target: PolicyTarget) {
    return this.database.transaction((transaction) =>
      readBookingPolicy(transaction, actor, target, this.clock),
    );
  }
  async authorize(transaction: Transaction, actor: Actor, target: PolicyTarget) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('hsm.booking.policy'))`);
    if (target.level === 'platform') {
      const [account] = await transaction
        .select({ id: adminAccounts.userId })
        .from(adminAccounts)
        .where(
          and(
            eq(adminAccounts.userId, actor.userId),
            eq(adminAccounts.isRoot, true),
            eq(adminAccounts.status, 'active'),
          ),
        )
        .for('update');
      const root = await new ScopeRepository(transaction).admin(actor.userId);
      if (!account || !root?.isRoot) throw new DomainError('FORBIDDEN', 403, 'Root scope required');
      return true;
    }
    if (target.level === 'hostel') {
      await lockSetupScope(transaction, actor, { kind: 'brand', id: target.id });
      return true;
    }
    const branchId = target.level === 'branch' ? target.id : target.branchId;
    if (!branchId) throw new DomainError('NOT_FOUND', 404, 'Policy scope unavailable');
    await lockInventoryScope(transaction, actor, branchId, 'policy_edit');
    if (target.level === 'room_type') {
      const [type] = await transaction
        .select({ id: roomTypes.id })
        .from(roomTypes)
        .where(
          and(
            eq(roomTypes.id, target.id),
            eq(roomTypes.branchId, branchId),
            isNull(roomTypes.archivedAt),
          ),
        )
        .for('update');
      if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
    }
    return true;
  }
  async save(
    transaction: Transaction,
    actor: Actor,
    target: PolicyTarget,
    input:
      | {
          policy: BookingPolicy;
          limits: Limits;
          expectedCurrentVersionId?: string | null | undefined;
        }
      | { overrides: BookingPolicyOverride },
  ) {
    const previous = await transaction
      .select()
      .from(bookingPolicies)
      .where(and(eq(bookingPolicies.isCurrent, true), targetCondition(target)))
      .for('update');
    if (
      'policy' in input &&
      input.expectedCurrentVersionId !== undefined &&
      (previous[0]?.id ?? null) !== input.expectedCurrentVersionId
    )
      throw new DomainError(
        'CONFLICT',
        409,
        'Platform booking settings changed; reload before saving',
      );
    const id = v7();
    const values = {
      id,
      brandId: target.level === 'hostel' ? target.id : null,
      branchId:
        target.level === 'branch'
          ? target.id
          : target.level === 'room_type'
            ? (target.branchId ?? null)
            : null,
      roomTypeId: target.level === 'room_type' ? target.id : null,
      policy: 'policy' in input ? input.policy : input.overrides,
      platformLimits: 'limits' in input ? input.limits : null,
      isCurrent: true,
      createdByUserId: actor.userId,
      createdAt: this.clock(),
    };
    const current = await transaction
      .select()
      .from(bookingPolicies)
      .where(eq(bookingPolicies.isCurrent, true));
    const candidate = [
      ...current.filter((row) => !previous.some((old) => old.id === row.id)),
      values,
    ];
    await this.validateChildren(transaction, candidate);
    for (const old of previous)
      await transaction
        .update(bookingPolicies)
        .set({ isCurrent: false })
        .where(eq(bookingPolicies.id, old.id));
    await transaction.insert(bookingPolicies).values(values);
    const result = bookingPolicyVersionSchema.parse({
      id,
      level: target.level,
      scopeId: 'id' in target ? target.id : null,
    });
    await this.audit.platform(transaction, {
      actorUserId: actor.userId,
      actorRole: target.level === 'platform' ? 'root' : 'management',
      action: 'booking.policy.versioned',
      targetType: 'booking_policy',
      targetId: id,
      after: result,
      createdAt: this.clock(),
    });
    return result;
  }
  private async validateChildren(
    transaction: Transaction,
    policies: readonly Pick<
      typeof bookingPolicies.$inferSelect,
      'brandId' | 'branchId' | 'roomTypeId' | 'policy' | 'platformLimits'
    >[],
  ) {
    const platform = policies.find((value) => value.brandId === null && value.branchId === null);
    if (!platform)
      throw new DomainError('CONFLICT', 409, 'Configure platform policy before Owner overrides');
    resolveBookingPolicy(platform.policy, [], platform.platformLimits);
    const hierarchy = await transaction
      .select({ branchId: branches.id, brandId: branches.brandId, typeId: roomTypes.id })
      .from(branches)
      .leftJoin(roomTypes, and(eq(roomTypes.branchId, branches.id), isNull(roomTypes.archivedAt)))
      .where(isNull(branches.archivedAt));
    const hostels = await transaction
      .select({ id: brands.id })
      .from(brands)
      .where(isNull(brands.archivedAt));
    for (const hostel of hostels) {
      const override = policies.find((value) => value.brandId === hostel.id);
      resolveBookingPolicy(
        platform.policy,
        override ? [override.policy] : [],
        platform.platformLimits,
      );
    }
    for (const row of hierarchy) {
      const layers = [
        policies.find((value) => value.brandId === row.brandId),
        policies.find((value) => value.branchId === row.branchId && value.roomTypeId === null),
        row.typeId ? policies.find((value) => value.roomTypeId === row.typeId) : undefined,
      ];
      resolveBookingPolicy(
        platform.policy,
        layers.filter((value) => value !== undefined).map((value) => value.policy),
        platform.platformLimits,
      );
    }
  }
}
