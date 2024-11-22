import { and, eq } from 'drizzle-orm';
import { managerAssignments, type Database } from '@hsm/db';
import { DomainError, type ManagerAction } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { ScopeRepository } from '../authorization/repository.js';
import type { Actor } from '../authorization/store.js';
import { lockParticipants } from './identity-lock.js';
import { LockedStaff } from './staff.transaction.js';
export class StaffRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  transition(
    actor: Actor,
    branchId: string,
    assignmentId: string,
    action: ManagerAction,
    reason: string | null,
  ) {
    return this.database.transaction(async (transaction) => {
      // SEC-001: resolve the immutable target, then lock identities before the assignment.
      const scope = and(
        eq(managerAssignments.id, assignmentId),
        eq(managerAssignments.branchId, branchId),
      );
      const [target] = await transaction
        .select({ userId: managerAssignments.userId })
        .from(managerAssignments)
        .where(scope);
      if (!target) throw new DomainError('NOT_FOUND', 404, 'Assignment unavailable');
      await lockParticipants(transaction, actor, target.userId, this.clock);
      if (!(await new ScopeRepository(transaction).branch(actor.userId, branchId, true)))
        throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
      const [assignment] = await transaction
        .select()
        .from(managerAssignments)
        .where(scope)
        .for('update');
      if (!assignment) throw new DomainError('NOT_FOUND', 404, 'Assignment unavailable');
      return new LockedStaff(transaction, actor, this.clock, this.audit).transition(
        assignment,
        action,
        reason,
      );
    });
  }
}
