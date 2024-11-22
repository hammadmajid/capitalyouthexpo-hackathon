import { and, eq, ne } from 'drizzle-orm';
import { v7 } from 'uuid';
import { managerAssignments, users, type Database } from '@hsm/db';
import {
  DomainError,
  type ManagerInvitationInput,
  type ManagerInvitationState,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
import { lockParticipants } from './identity-lock.js';
import { lockInvitationBranch } from './invitation.scope.js';
import {
  invitationState,
  requireInvitationIdentity,
  requireTemporaryReset,
} from './invitation.policy.js';
export class InvitationRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
  ) {}
  async resolve(phone: string) {
    const [identity] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, phone));
    return identity?.id ?? v7();
  }
  async resolveAssignment(branchId: string, assignmentId: string) {
    const [assignment] = await this.database
      .select({ userId: managerAssignments.userId })
      .from(managerAssignments)
      .where(
        and(eq(managerAssignments.id, assignmentId), eq(managerAssignments.branchId, branchId)),
      );
    if (!assignment) throw new DomainError('NOT_FOUND', 404, 'Assignment unavailable');
    return assignment.userId;
  }
  store(targetId: string) {
    return new IdempotencyRepository(this.database, (transaction, actor, now) =>
      lockParticipants(transaction, actor, targetId, () => now),
    );
  }
  async authorize(database: Transaction, actor: Actor, branchId: string) {
    await lockInvitationBranch(database, actor, branchId);
    return true;
  }
  async invite(
    database: Transaction,
    actor: Actor,
    branchId: string,
    targetId: string,
    input: ManagerInvitationInput,
    credentialHash: string,
    now: Date,
  ) {
    const [existing] = await database.select().from(users).where(eq(users.phoneE164, input.phone));
    requireInvitationIdentity(existing, targetId, input.phone);
    if (!existing) {
      const rows = await database
        .insert(users)
        .values({
          id: targetId,
          fullName: input.fullName,
          phoneE164: input.phone,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!rows.length) throw new DomainError('CONFLICT', 409, 'Invitation unavailable; retry');
    }
    const [live] = await database
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(
        and(eq(managerAssignments.userId, targetId), ne(managerAssignments.status, 'deactivated')),
      )
      .for('update');
    if (live) throw new DomainError('CONFLICT', 409, 'Identity already has a live assignment');
    const permanent = existing?.passwordHash != null;
    const state = invitationState(v7(), branchId, permanent, now);
    const rows = await database
      .insert(managerAssignments)
      .values({
        id: state.id,
        userId: targetId,
        branchId,
        appointedByUserId: actor.userId,
        tempPasswordHash: permanent ? null : credentialHash,
        tempPasswordExpiresAt: new Date(state.expiresAt),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: managerAssignments.id });
    if (!rows.length)
      throw new DomainError('CONFLICT', 409, 'Identity already has a live assignment');
    await this.record(database, actor, state, 'manager.invited', now);
    return state;
  }
  async requireReset(
    database: Transaction,
    branchId: string,
    assignmentId: string,
    targetId: string,
  ) {
    const [assignment] = await database
      .select()
      .from(managerAssignments)
      .where(
        and(eq(managerAssignments.id, assignmentId), eq(managerAssignments.branchId, branchId)),
      )
      .for('update');
    const [identity] = await database.select().from(users).where(eq(users.id, targetId));
    if (!assignment || assignment.userId !== targetId || !identity)
      throw new DomainError('NOT_FOUND', 404, 'Assignment unavailable');
    requireInvitationIdentity(identity, targetId, identity.phoneE164 ?? '');
    requireTemporaryReset(assignment.status, identity.passwordHash);
    return assignment;
  }
  async reset(
    database: Transaction,
    actor: Actor,
    branchId: string,
    assignmentId: string,
    targetId: string,
    credentialHash: string,
    now: Date,
  ) {
    await this.requireReset(database, branchId, assignmentId, targetId);
    const state = invitationState(assignmentId, branchId, false, now);
    await database
      .update(managerAssignments)
      .set({
        tempPasswordHash: credentialHash,
        tempPasswordExpiresAt: new Date(state.expiresAt),
        tempPasswordAttempts: 0,
        lockedAt: null,
        updatedAt: now,
      })
      .where(eq(managerAssignments.id, assignmentId));
    await this.record(database, actor, state, 'manager.temporary_password_reset', now);
    return state;
  }
  private async record(
    database: Transaction,
    actor: Actor,
    state: ManagerInvitationState,
    action: string,
    now: Date,
  ) {
    const organizationId = await lockInvitationBranch(database, actor, state.branchId);
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: 'owner',
      action,
      targetType: 'manager_assignment',
      targetId: state.id,
      organizationId,
      branchId: state.branchId,
      before: null,
      after: { status: state.status, acceptance: state.acceptance, expiresAt: state.expiresAt },
      createdAt: now,
    });
  }
}
