import { GeographyReadRepository } from './geography.repository.js';
import type { AreaPageInput } from '@hsm/contracts';
import { and, eq, exists, gt, isNull, or } from 'drizzle-orm';
import { brands, branches, managerAssignments, organizations, users, type Database } from '@hsm/db';
import { DomainError, type ManagementPage } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import { ScopeRepository } from '../authorization/repository.js';
export class ManagementReadRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  cities(actor: Actor, page: ManagementPage) {
    return new GeographyReadRepository(this.database, this.clock).cities(actor, page);
  }
  areas(actor: Actor, cityId: string, page: AreaPageInput) {
    return new GeographyReadRepository(this.database, this.clock).areas(actor, cityId, page);
  }
  organizations(actor: Actor, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      if (!(await new ScopeRepository(transaction).owner(actor.userId)))
        throw new DomainError('FORBIDDEN', 403, 'Owner unavailable');
      return transaction
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(
          and(
            eq(organizations.ownerUserId, actor.userId),
            isNull(organizations.archivedAt),
            page.cursor ? gt(organizations.id, page.cursor) : undefined,
          ),
        )
        .orderBy(organizations.id)
        .limit(page.limit + 1);
    });
  }
  branches(actor: Actor, page: ManagementPage, ownerOnly: boolean) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      if (ownerOnly && !(await new ScopeRepository(transaction).owner(actor.userId)))
        throw new DomainError('FORBIDDEN', 403, 'Owner unavailable');
      const assignment = transaction
        .select({ id: managerAssignments.id })
        .from(managerAssignments)
        .where(
          and(
            eq(managerAssignments.branchId, branches.id),
            eq(managerAssignments.userId, actor.userId),
            eq(managerAssignments.status, 'active'),
          ),
        );
      return transaction
        .select({
          id: branches.id,
          organizationId: branches.organizationId,
          brandId: branches.brandId,
          name: branches.name,
          verificationStatus: branches.verificationStatus,
        })
        .from(branches)
        .innerJoin(brands, eq(brands.id, branches.brandId))
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(
          and(
            isNull(branches.archivedAt),
            isNull(brands.archivedAt),
            isNull(organizations.archivedAt),
            ownerOnly
              ? eq(organizations.ownerUserId, actor.userId)
              : or(eq(organizations.ownerUserId, actor.userId), exists(assignment)),
            page.cursor ? gt(branches.id, page.cursor) : undefined,
          ),
        )
        .orderBy(branches.id)
        .limit(page.limit + 1);
    });
  }
  branch(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      if (!(await new ScopeRepository(transaction).branch(actor.userId, branchId, false)))
        throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
      const [row] = await transaction
        .select({
          id: branches.id,
          organizationId: branches.organizationId,
          brandId: branches.brandId,
          name: branches.name,
          verificationStatus: branches.verificationStatus,
        })
        .from(branches)
        .where(eq(branches.id, branchId));
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
      return row;
    });
  }
  managers(actor: Actor, branchId: string, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      if (!(await new ScopeRepository(transaction).branch(actor.userId, branchId, true)))
        throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
      return transaction
        .select({
          id: managerAssignments.id,
          userId: managerAssignments.userId,
          branchId: managerAssignments.branchId,
          fullName: users.fullName,
          status: managerAssignments.status,
        })
        .from(managerAssignments)
        .innerJoin(users, eq(users.id, managerAssignments.userId))
        .where(
          and(
            eq(managerAssignments.branchId, branchId),
            page.cursor ? gt(managerAssignments.id, page.cursor) : undefined,
          ),
        )
        .orderBy(managerAssignments.id)
        .limit(page.limit + 1);
    });
  }
  // AUTH-M-006: the acting Owner's own password hash, to confirm a Manager removal.
  async passwordHash(userId: string) {
    const [row] = await this.database
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.passwordHash ?? null;
  }
}
