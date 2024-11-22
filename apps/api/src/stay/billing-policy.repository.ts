import { cleanAgreementFile } from './agreement-document.scope.js';
import { DomainError, type AgreementTemplateInput } from '@hsm/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  billingPolicies,
  managerAssignments,
  managerInventoryGrants,
  type Database,
} from '@hsm/db';
import {
  billingSettingsReadSchema,
  billingPolicySchema,
  configuredTransportSubscription,
  billingPolicyVersionSchema,
  type BillingPolicy,
  type BillingSettingsTarget,
  type TransportBillingPolicyInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import {
  billingSettingsScope,
  billingLineageScope,
  localBillingScope,
} from './billing-policy.scope.js';

import { lockStaffScope } from '../services/scope.js';

const transportGrants = ['finance_view', 'rent_manage'] as const;

async function managerCanEditTransport(tx: Transaction, actor: Actor, branchId: string) {
  const grants = await tx
    .select({ permission: managerInventoryGrants.permission })
    .from(managerInventoryGrants)
    .innerJoin(managerAssignments, eq(managerAssignments.id, managerInventoryGrants.assignmentId))
    .where(
      and(
        eq(managerAssignments.branchId, branchId),
        eq(managerAssignments.userId, actor.userId),
        eq(managerAssignments.status, 'active'),
        inArray(managerInventoryGrants.permission, transportGrants),
      ),
    );
  return transportGrants.every((permission) =>
    grants.some((grant) => grant.permission === permission),
  );
}

type PolicyRow = typeof billingPolicies.$inferSelect;
export function billingPolicyVersion(row: PolicyRow) {
  const level = row.roomTypeId
    ? 'room_type'
    : row.branchId
      ? 'branch'
      : row.brandId
        ? 'hostel'
        : 'platform';
  return billingPolicyVersionSchema.parse({
    id: row.id,
    level,
    scopeId: row.roomTypeId ?? row.branchId ?? row.brandId,
    policy: row.policy,
    createdAt: row.createdAt.toISOString(),
  });
}
export class BillingPolicyRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
    private readonly privateBucket?: string,
  ) {}
  async authorize(transaction: Transaction, actor: Actor, target: BillingSettingsTarget) {
    await billingSettingsScope(transaction, actor, target, this.clock, true);
    return true;
  }
  async authorizeTransport(tx: Transaction, actor: Actor, branchId: string) {
    return lockStaffScope(tx, actor, branchId, transportGrants, this.clock);
  }
  read(actor: Actor, target: BillingSettingsTarget) {
    return this.database.transaction(async (transaction) => {
      const scope = await billingSettingsScope(transaction, actor, target, this.clock);
      // Four unique policy scopes at most. This is a fixed-size lineage, never a history collection.
      const rows = await transaction
        .select()
        .from(billingPolicies)
        .where(and(eq(billingPolicies.isCurrent, true), billingLineageScope(target, scope.brandId)))
        .limit(4);
      const type = rows.find(
        (row) => row.roomTypeId === target.roomTypeId && target.roomTypeId !== undefined,
      );
      const branch = rows.find(
        (row) => row.branchId === target.branchId && row.roomTypeId === null,
      );
      const hostel = rows.find((row) => row.brandId === scope.brandId);
      const platform = rows.find((row) => row.brandId === null && row.branchId === null);
      const local = target.roomTypeId === undefined ? branch : type;
      const effective = type ?? branch ?? hostel ?? platform;
      return billingSettingsReadSchema.parse({
        target,
        canEdit: scope.actorRole === 'owner',
        ...(target.roomTypeId === undefined && effective
          ? {
              canEditTransport:
                scope.actorRole === 'owner' ||
                (await managerCanEditTransport(transaction, actor, target.branchId)),
            }
          : {}),
        localVersion: local ? billingPolicyVersion(local) : null,
        effectiveVersion: effective ? billingPolicyVersion(effective) : null,
      });
    });
  }
  async saveTransport(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    input: TransportBillingPolicyInput,
  ) {
    const scope = await this.authorizeTransport(tx, actor, branchId);
    const target = { branchId };
    const lineage = await billingSettingsScope(tx, actor, target, this.clock);
    const current = await currentBranchPolicy(tx, branchId, lineage.brandId);
    if (!current || current.id !== input.policyVersionId)
      throw new DomainError('PRECONDITION_FAILED', 412, 'Review the current policy before saving');
    const policy = billingPolicyVersion(current).policy;
    const previousOffer = policy.transportBilling?.offer;
    const requested = input.transportBilling;
    // A client updating legacy billing rules must not clear the published offer.
    if (
      !requested.offer &&
      (previousOffer?.mode === 'included' || (!('dueDay' in requested) && previousOffer))
    )
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Review the current Transport pricing mode',
      );
    const previousSubscription = configuredTransportSubscription(policy.transportBilling);
    // Bug fix: with no subscription ever set, an "included" offer must not carry
    // `monthlySubscription: undefined` (it broke the idempotent reply and the save failed).
    const subscription =
      ('monthlySubscription' in requested ? requested.monthlySubscription : undefined) ??
      previousSubscription;
    const transportBilling =
      'dueDay' in requested && !requested.offer && previousOffer?.mode === 'separate'
        ? { ...requested, offer: previousOffer }
        : requested.offer?.mode === 'included' && !('dueDay' in requested)
          ? {
              offer: { mode: 'included' as const },
              ...(subscription ? { monthlySubscription: subscription } : {}),
            }
          : requested;
    return this.append(tx, actor, target, { ...policy, transportBilling }, scope);
  }
  async saveTemplate(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    input: AgreementTemplateInput,
  ) {
    const scope = await billingSettingsScope(tx, actor, { branchId }, this.clock, true);
    const current = await currentBranchPolicy(tx, branchId, scope.brandId);
    if (!current || current.id !== input.policyVersionId)
      throw new DomainError('PRECONDITION_FAILED', 412, 'Review the current policy before saving');
    const policy = billingPolicyVersion(current).policy;
    const { agreementTemplate: previousTemplate, ...financialPolicy } = policy;
    void previousTemplate;
    return this.save(
      tx,
      actor,
      { branchId },
      { ...financialPolicy, ...(input.template ? { agreementTemplate: input.template } : {}) },
    );
  }
  async save(
    transaction: Transaction,
    actor: Actor,
    target: BillingSettingsTarget,
    policy: BillingPolicy,
  ) {
    const scope = await billingSettingsScope(transaction, actor, target, this.clock, true);
    if (policy.agreementTemplate?.fileId) {
      if (!this.privateBucket)
        throw new DomainError('INTERNAL', 503, 'Agreement storage unavailable');
      await cleanAgreementFile(
        transaction,
        policy.agreementTemplate.fileId,
        'agreement_template',
        this.privateBucket,
        actor.userId,
      );
    }
    const { transportBilling: ignored, ...rentPolicy } = policy;
    void ignored;
    return this.append(transaction, actor, target, rentPolicy, scope);
  }
  private async append(
    transaction: Transaction,
    actor: Actor,
    target: BillingSettingsTarget,
    input: BillingPolicy,
    scope: { actorRole: string; organizationId: string },
  ) {
    const previous = await transaction
      .select({ id: billingPolicies.id, policy: billingPolicies.policy })
      .from(billingPolicies)
      .where(and(eq(billingPolicies.isCurrent, true), localBillingScope(target)))
      .for('update');
    for (const row of previous)
      await transaction
        .update(billingPolicies)
        .set({ isCurrent: false })
        .where(eq(billingPolicies.id, row.id));
    const savedPolicy = previous[0]?.policy;
    const transportBilling =
      input.transportBilling ??
      (target.roomTypeId === undefined && savedPolicy
        ? billingPolicySchema.parse(savedPolicy).transportBilling
        : undefined);
    const policy = transportBilling ? { ...input, transportBilling } : input;
    const now = this.clock(),
      id = v7();
    const row = {
      id,
      brandId: null,
      branchId: target.branchId,
      roomTypeId: target.roomTypeId ?? null,
      policy,
      isCurrent: true,
      createdByUserId: actor.userId,
      createdAt: now,
    };
    await transaction.insert(billingPolicies).values(row);
    const result = billingPolicyVersion(row);
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId: target.branchId,
      action: 'billing.policy.versioned',
      targetType: 'billing_policy',
      targetId: id,
      after: result,
      createdAt: now,
    });
    return result;
  }
}

async function currentBranchPolicy(tx: Transaction, branchId: string, brandId: string) {
  const rows = await tx
    .select()
    .from(billingPolicies)
    .where(and(eq(billingPolicies.isCurrent, true), billingLineageScope({ branchId }, brandId)))
    .limit(3);
  return (
    rows.find((row) => row.branchId === branchId && row.roomTypeId === null) ??
    rows.find((row) => row.brandId === brandId) ??
    rows.find((row) => row.brandId === null && row.branchId === null)
  );
}
