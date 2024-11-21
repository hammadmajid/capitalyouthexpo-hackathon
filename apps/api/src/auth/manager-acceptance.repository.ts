import { and, eq, isNull, ne } from 'drizzle-orm';
import { branches, brands, managerAssignments, organizations, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from './actor-lock.js';
import { requirePendingManagerInvitation } from './manager-acceptance.policy.js';
import { grantFullBranchAccess } from './manager-full-access.js';
export class ManagerAcceptanceRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async accept(actor: Actor) {
    await this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const [identity] = await transaction
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, actor.userId))
        .for('update');
      if (!identity?.passwordHash)
        throw new DomainError('FORBIDDEN', 403, 'Permanent authentication required');
      const [candidate] = await transaction
        .select()
        .from(managerAssignments)
        .where(
          and(
            eq(managerAssignments.userId, actor.userId),
            ne(managerAssignments.status, 'deactivated'),
          ),
        )
        .for('update');
      const now = this.clock();
      const invitation = requirePendingManagerInvitation(candidate, now);
      const branch = await this.branch(transaction, invitation.branchId);
      await transaction
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
        .where(
          and(
            eq(managerAssignments.id, invitation.id),
            eq(managerAssignments.userId, actor.userId),
          ),
        );
      // CHG-029: an accepted Manager can run the whole branch (granted and audited here).
      await grantFullBranchAccess(
        transaction,
        {
          assignmentId: invitation.id,
          branchId: invitation.branchId,
          managerUserId: actor.userId,
          now,
        },
        this.audit,
      );
      await this.audit.hostel(transaction, {
        actorUserId: actor.userId,
        actorRole: 'self',
        action: 'manager.invitation.accept',
        targetType: 'manager_assignment',
        targetId: invitation.id,
        organizationId: branch.organizationId,
        branchId: invitation.branchId,
        before: { status: 'pending_activation' },
        after: { status: 'active' },
        createdAt: now,
      });
    });
  }
  private async branch(transaction: Transaction, branchId: string) {
    const [branch] = await transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(
        and(
          eq(branches.id, branchId),
          isNull(branches.archivedAt),
          isNull(brands.archivedAt),
          isNull(organizations.archivedAt),
        ),
      )
      .limit(1);
    if (!branch) throw new DomainError('NOT_FOUND', 404, 'Invitation unavailable');
    return branch;
  }
}
