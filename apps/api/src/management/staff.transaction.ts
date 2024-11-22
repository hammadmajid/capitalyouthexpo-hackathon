import { and, eq, isNull } from 'drizzle-orm';
import { branches, managerAssignments, sessions } from '@hsm/db';
import { DomainError, type ManagerAction } from '@hsm/contracts';
import { NotificationProducer } from '@hsm/notifications';
import { v7 } from 'uuid';
import type { AuditWriter, Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { managerTransition } from './policy.js';
type Assignment = typeof managerAssignments.$inferSelect;
export class LockedStaff {
  constructor(
    private readonly transaction: Transaction,
    private readonly actor: Actor,
    private readonly clock: () => Date,
    private readonly audit: AuditWriter,
  ) {}
  async transition(assignment: Assignment, action: ManagerAction, reason: string | null) {
    const status = managerTransition(assignment.status, action);
    const result = { id: assignment.id, branchId: assignment.branchId, status };
    if (status === assignment.status) return result;
    const now = this.clock();
    await this.update(assignment, status, action, reason, now);
    // MGR-004/AUTH-M-006: suspend/fire revoke sessions; reinstate never restores them.
    if (action !== 'reinstate')
      await this.transaction
        .update(sessions)
        .set({ revokedAt: now, revokedReason: 'manager_' + action })
        .where(and(eq(sessions.userId, assignment.userId), isNull(sessions.revokedAt)));
    await this.record(assignment, status, action, reason, now);
    return result;
  }
  private async update(
    assignment: Assignment,
    status: Assignment['status'],
    action: ManagerAction,
    reason: string | null,
    now: Date,
  ) {
    await this.transaction
      .update(managerAssignments)
      .set({
        status,
        statusReason: reason,
        updatedAt: now,
        ...(action === 'suspend' ? { suspendedAt: now } : {}),
        ...(action === 'reinstate' ? { suspendedAt: null } : {}),
        ...(action === 'deactivate'
          ? { deactivatedAt: now, tempPasswordHash: null, tempPasswordExpiresAt: null }
          : {}),
      })
      .where(
        and(
          eq(managerAssignments.id, assignment.id),
          eq(managerAssignments.branchId, assignment.branchId),
        ),
      );
  }
  private async record(
    assignment: Assignment,
    status: Assignment['status'],
    action: ManagerAction,
    reason: string | null,
    now: Date,
  ) {
    const [branch] = await this.transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, assignment.branchId));
    if (!branch) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
    await this.audit.hostel(this.transaction, {
      actorUserId: this.actor.userId,
      actorRole: 'owner',
      action: 'manager.' + action,
      targetType: 'manager_assignment',
      targetId: assignment.id,
      organizationId: branch.organizationId,
      branchId: assignment.branchId,
      before: { status: assignment.status },
      after: { status, reason },
      createdAt: now,
    });
    const event = {
      suspend: 'manager.suspended',
      reinstate: 'manager.reinstated',
      deactivate: 'manager.deactivated',
    } as const;
    await new NotificationProducer().enqueue(
      this.transaction,
      { userId: assignment.userId, event: event[action], operationId: v7() },
      now,
    );
  }
}
