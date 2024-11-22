import { and, eq, sql } from 'drizzle-orm';
import { hostelRules, type Database } from '@hsm/db';
import { v7 } from 'uuid';
import {
  DomainError,
  privateListingRuleStateSchema,
  type ListingRuleInput,
  type ListingRulesQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import {
  projectListingRule,
  readListingRuleRow,
  readListingRulesPage,
} from './listing-rules-state.js';
export class ListingRulesRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(transaction: Transaction, actor: Actor, branchId: string, edit = true) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(
      transaction,
      actor,
      branchId,
      edit ? 'listing_edit' : undefined,
    );
    await lockActor(transaction, actor, this.clock);
    return scope;
  }
  async authorizeRule(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    ruleId: string,
    edit = true,
  ) {
    const scope = await this.authorize(transaction, actor, branchId, edit);
    const row = await readListingRuleRow(transaction, branchId, ruleId);
    await lockActor(transaction, actor, this.clock);
    return { scope, row };
  }
  read(actor: Actor, branchId: string, input: ListingRulesQuery) {
    return this.database.transaction(async (transaction) => {
      const scope = await this.authorize(transaction, actor, branchId, false);
      const access = await inventoryPermissions(
        transaction,
        actor,
        branchId,
        scope.actorRole === 'owner',
      );
      const result = await readListingRulesPage(
        transaction,
        branchId,
        input,
        access.permissions.includes('listing_edit'),
      );
      await lockActor(transaction, actor, this.clock);
      return result;
    });
  }
  one(actor: Actor, branchId: string, ruleId: string) {
    return this.database.transaction(async (transaction) => {
      const { scope, row } = await this.authorizeRule(transaction, actor, branchId, ruleId, false);
      const access = await inventoryPermissions(
        transaction,
        actor,
        branchId,
        scope.actorRole === 'owner',
      );
      await lockActor(transaction, actor, this.clock);
      return privateListingRuleStateSchema.parse({
        ...projectListingRule(row),
        canEdit: access.permissions.includes('listing_edit'),
      });
    });
  }
  private async changed(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    scope: Awaited<ReturnType<typeof lockInventoryScope>>,
    ruleId: string,
    action: string,
    before: ReturnType<typeof projectListingRule> | null,
    reason?: string,
  ) {
    const after = projectListingRule(await readListingRuleRow(transaction, branchId, ruleId));
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action,
      targetType: 'hostel_rule',
      targetId: ruleId,
      before,
      after: { ...after, ...(reason === undefined ? {} : { reason }) },
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return privateListingRuleStateSchema.parse({ ...after, canEdit: true });
  }
  async create(transaction: Transaction, actor: Actor, branchId: string, input: ListingRuleInput) {
    const scope = await this.authorize(transaction, actor, branchId),
      id = v7(),
      now = this.clock();
    await transaction.insert(hostelRules).values({
      id,
      branchId,
      ...input,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    return this.changed(transaction, actor, branchId, scope, id, 'listing.rule.created', null);
  }
  private async current(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    ruleId: string,
    version: string,
  ) {
    const { scope, row } = await this.authorizeRule(transaction, actor, branchId, ruleId);
    const before = projectListingRule(row);
    if (before.version !== version)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Listing rule changed; refresh its current state',
      );
    if (row.archivedAt !== null) throw new DomainError('CONFLICT', 409, 'Listing rule is archived');
    return { scope, row, before };
  }
  async edit(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    ruleId: string,
    version: string,
    input: ListingRuleInput,
  ) {
    const { scope, row, before } = await this.current(
      transaction,
      actor,
      branchId,
      ruleId,
      version,
    );
    if (row.revision === 2147483647)
      throw new DomainError('CONFLICT', 409, 'Archive this rule before creating a replacement');
    await lockActor(transaction, actor, this.clock);
    await transaction
      .update(hostelRules)
      .set({ ...input, updatedAt: this.clock(), revision: sql`${hostelRules.revision} + 1` })
      .where(and(eq(hostelRules.branchId, branchId), eq(hostelRules.id, ruleId)));
    return this.changed(
      transaction,
      actor,
      branchId,
      scope,
      ruleId,
      'listing.rule.changed',
      before,
    );
  }
  async archive(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    ruleId: string,
    version: string,
    reason: string,
  ) {
    const { scope, row, before } = await this.current(
      transaction,
      actor,
      branchId,
      ruleId,
      version,
    );
    const now = this.clock();
    await lockActor(transaction, actor, this.clock);
    await transaction
      .update(hostelRules)
      .set({
        archivedAt: now,
        updatedAt: now,
        revision: row.revision === 2147483647 ? row.revision : sql`${hostelRules.revision} + 1`,
      })
      .where(and(eq(hostelRules.branchId, branchId), eq(hostelRules.id, ruleId)));
    return this.changed(
      transaction,
      actor,
      branchId,
      scope,
      ruleId,
      'listing.rule.archived',
      before,
      reason,
    );
  }
}
