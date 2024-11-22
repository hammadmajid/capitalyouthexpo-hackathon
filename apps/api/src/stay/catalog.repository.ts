import { and, eq, gt, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { residentChargeCatalog, type Database } from '@hsm/db';
import {
  billingCatalogPageSchema,
  DomainError,
  type BillingCatalogInput,
  type BillingCatalogQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { inventoryPageRows } from '../inventory/page-projection.js';
import { catalogScope, lockCatalogEntry } from './catalog.scope.js';
import { catalogResult, projectCatalog } from './catalog.projection.js';
export class BillingCatalogRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorizeCreate(transaction: Transaction, actor: Actor, branchId: string) {
    await catalogScope(transaction, actor, branchId, this.clock, true);
    return true;
  }
  async authorizeArchive(transaction: Transaction, actor: Actor, branchId: string, id: string) {
    await catalogScope(transaction, actor, branchId, this.clock, true);
    await lockCatalogEntry(transaction, branchId, id);
    return true;
  }
  read(actor: Actor, branchId: string, query: BillingCatalogQuery) {
    return this.database.transaction(async (transaction) => {
      const scope = await catalogScope(transaction, actor, branchId, this.clock),
        includeArchived = query.includeArchived === 'true';
      const rows = await transaction
        .select()
        .from(residentChargeCatalog)
        .where(
          and(
            eq(residentChargeCatalog.branchId, branchId),
            includeArchived ? undefined : isNull(residentChargeCatalog.archivedAt),
            query.cursor === undefined ? undefined : gt(residentChargeCatalog.id, query.cursor),
          ),
        )
        .orderBy(residentChargeCatalog.id)
        .limit(query.limit + 1);
      const page = inventoryPageRows(rows, query);
      return catalogResult(billingCatalogPageSchema, {
        branchId,
        canEdit: scope.actorRole === 'owner',
        includeArchived,
        data: page.data.map(projectCatalog),
        nextCursor: page.nextCursor,
      });
    });
  }
  async create(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    input: BillingCatalogInput,
  ) {
    const scope = await catalogScope(transaction, actor, branchId, this.clock, true),
      now = this.clock();
    const row = {
      id: v7(),
      branchId,
      code: input.code,
      name: input.name,
      unitLabel: input.unitLabel,
      unitAmountPaisa: BigInt(input.unitAmountPaisa),
      createdByUserId: actor.userId,
      createdAt: now,
      archivedAt: null,
    };
    const result = projectCatalog(row);
    await transaction.insert(residentChargeCatalog).values(row);
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'billing.catalog.created',
      targetType: 'resident_charge_catalog',
      targetId: row.id,
      after: result,
      createdAt: now,
    });
    return result;
  }
  async archive(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    reason: string,
  ) {
    const scope = await catalogScope(transaction, actor, branchId, this.clock, true),
      row = await lockCatalogEntry(transaction, branchId, id);
    if (row.archivedAt !== null)
      throw new DomainError('CONFLICT', 409, 'Catalogue entry already archived');
    const now = this.clock(),
      before = projectCatalog(row),
      after = projectCatalog({ ...row, archivedAt: now });
    await transaction
      .update(residentChargeCatalog)
      .set({ archivedAt: now })
      .where(
        and(
          eq(residentChargeCatalog.branchId, branchId),
          eq(residentChargeCatalog.id, id),
          isNull(residentChargeCatalog.archivedAt),
        ),
      );
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'billing.catalog.archived',
      targetType: 'resident_charge_catalog',
      targetId: id,
      before,
      after: { ...after, reason },
      createdAt: now,
    });
    return after;
  }
}
