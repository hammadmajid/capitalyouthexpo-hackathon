import { and, eq, exists, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  adminAccounts,
  adminRoleGrants,
  brands,
  branches,
  customerProfiles,
  managerAssignments,
  organizations,
  users,
  type Database,
} from '@hsm/db';
import type { ScopeStore } from './store.js';
import type { Transaction } from '../audit/writer.js';
const actorAssignments = alias(managerAssignments, 'scope_actor_assignments');
export class ScopeRepository implements ScopeStore {
  constructor(private readonly database: Database | Transaction) {}
  private branchAccess(userId: string, ownerOnly: boolean) {
    const owner = eq(organizations.ownerUserId, userId);
    if (ownerOnly) return owner;
    const assignment = this.database
      .select({ id: actorAssignments.id })
      .from(actorAssignments)
      .where(
        and(
          eq(actorAssignments.branchId, branches.id),
          eq(actorAssignments.userId, userId),
          eq(actorAssignments.status, 'active'),
        ),
      );
    return or(owner, exists(assignment));
  }
  private liveBranch() {
    return and(
      isNull(branches.archivedAt),
      isNull(brands.archivedAt),
      isNull(organizations.archivedAt),
      eq(users.accountStatus, 'active'),
    );
  }
  async customer(userId: string) {
    const rows = await this.database
      .select({ id: customerProfiles.userId })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(and(eq(users.id, userId), eq(users.accountStatus, 'active')))
      .limit(1);
    return rows.length > 0;
  }
  async owner(userId: string, organizationId?: string) {
    const rows = await this.database
      .select({ id: organizations.id })
      .from(organizations)
      .innerJoin(users, eq(users.id, organizations.ownerUserId))
      .where(
        and(
          eq(users.id, userId),
          eq(users.accountStatus, 'active'),
          isNull(organizations.archivedAt),
          organizationId ? eq(organizations.id, organizationId) : undefined,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async branch(userId: string, branchId: string, ownerOnly: boolean) {
    const rows = await this.database
      .select({ id: branches.id })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(users, eq(users.id, userId))
      .where(
        and(eq(branches.id, branchId), this.liveBranch(), this.branchAccess(userId, ownerOnly)),
      )
      .limit(1);
    return rows.length > 0;
  }
  async object(userId: string, assignmentId: string, ownerOnly: boolean, branchId?: string) {
    const [row] = await this.database
      .select({ branchId: branches.id })
      .from(managerAssignments)
      .innerJoin(branches, eq(branches.id, managerAssignments.branchId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(users, eq(users.id, userId))
      .where(
        and(
          eq(managerAssignments.id, assignmentId),
          branchId ? eq(branches.id, branchId) : undefined,
          this.liveBranch(),
          this.branchAccess(userId, ownerOnly),
        ),
      )
      .limit(1);
    return row;
  }
  async admin(userId: string) {
    const [account] = await this.database
      .select({ isRoot: adminAccounts.isRoot })
      .from(adminAccounts)
      .innerJoin(users, eq(users.id, adminAccounts.userId))
      .where(
        and(
          eq(users.id, userId),
          eq(users.accountStatus, 'active'),
          eq(adminAccounts.status, 'active'),
        ),
      )
      .limit(1);
    if (!account) return undefined;
    const grants = await this.database
      .select({ role: adminRoleGrants.role })
      .from(adminRoleGrants)
      .where(and(eq(adminRoleGrants.adminUserId, userId), isNull(adminRoleGrants.revokedAt)));
    return { isRoot: account.isRoot, roles: grants.map((grant) => grant.role) };
  }
}
