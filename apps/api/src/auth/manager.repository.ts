import { and, eq, isNull, ne } from 'drizzle-orm';
import { DomainError } from '@hsm/contracts';
import {
  branches,
  brands,
  managerAssignments,
  organizations,
  sessions,
  users,
  type Database,
} from '@hsm/db';
import type { ManagerStore, ManagerTransaction } from './manager.store.js';
import { grantFullBranchAccess } from './manager-full-access.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
class LockedManager implements ManagerTransaction {
  constructor(
    private readonly database: Transaction,
    readonly identity: ManagerTransaction['identity'],
    readonly invitation: ManagerTransaction['invitation'],
  ) {}
  async attempt(count: number, now: Date) {
    if (!this.invitation) return;
    await this.database
      .update(managerAssignments)
      .set({ tempPasswordAttempts: count, lockedAt: count >= 5 ? now : null, updatedAt: now })
      .where(eq(managerAssignments.id, this.invitation.id));
  }
  async activate(passwordHash: string, now: Date) {
    if (!this.identity || !this.invitation) return;
    if (this.identity.passwordHash !== null)
      throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    await this.database
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, this.identity.id));
    await this.database
      .update(managerAssignments)
      .set({
        status: 'active',
        activatedAt: now,
        updatedAt: now,
        tempPasswordHash: null,
        tempPasswordExpiresAt: null,
        tempPasswordAttempts: 0,
        lockedAt: null,
      })
      .where(eq(managerAssignments.id, this.invitation.id));
    // CHG-029: an activated Manager can run the whole branch (granted and audited here).
    await grantFullBranchAccess(this.database, {
      assignmentId: this.invitation.id,
      branchId: this.invitation.branchId,
      managerUserId: this.identity.id,
      now,
    });
    await this.database
      .update(sessions)
      .set({ revokedAt: now, revokedReason: 'manager_activation' })
      .where(and(eq(sessions.userId, this.identity.id), isNull(sessions.revokedAt)));
  }
}
export class ManagerRepository implements ManagerStore {
  constructor(private readonly database: Database) {}
  transaction<T>(phone: string, work: (value: ManagerTransaction) => Promise<T>) {
    return this.database.transaction(async (database) => {
      // AUTH-M: credentials and owner revocation serialize on the same identity lock.
      const [identity] = await database
        .select({
          id: users.id,
          accountStatus: users.accountStatus,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.phoneE164, phone))
        .for('update');
      if (!identity) return work(new LockedManager(database, undefined, undefined));
      const [invitation] = await database
        .select()
        .from(managerAssignments)
        .where(
          and(
            eq(managerAssignments.userId, identity.id),
            ne(managerAssignments.status, 'deactivated'),
          ),
        )
        .for('update');
      if (!invitation) return work(new LockedManager(database, identity, undefined));
      const allowed = await database
        .select({ id: branches.id })
        .from(branches)
        .innerJoin(brands, eq(brands.id, branches.brandId))
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(
          and(
            eq(branches.id, invitation.branchId),
            isNull(branches.archivedAt),
            isNull(brands.archivedAt),
            isNull(organizations.archivedAt),
          ),
        )
        .limit(1);
      return work(new LockedManager(database, identity, allowed.length ? invitation : undefined));
    });
  }
}
