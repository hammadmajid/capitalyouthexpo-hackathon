import { and, eq, isNull } from 'drizzle-orm';
import { users, managerAssignments, branches, brands, organizations, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from './actor-lock.js';
import { LockedOtp } from './otp.repository.js';
import type { OtpIdentity } from './otp.store.js';
import type {
  EmailAssociationStore,
  EmailAssociationTransaction,
} from './email-association.store.js';
import { identityUniqueFailure } from './identity-conflict.js';
export class LockedEmailAssociation extends LockedOtp implements EmailAssociationTransaction {
  constructor(
    private readonly transaction: Transaction,
    identity: OtpIdentity | undefined,
    private readonly actor: Actor,
    private readonly audit: AuditWriter,
  ) {
    super(transaction, identity);
  }
  async managerAllowed() {
    const rows = await this.transaction
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .innerJoin(branches, eq(branches.id, managerAssignments.branchId))
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(
        and(
          eq(managerAssignments.userId, this.actor.userId),
          eq(managerAssignments.status, 'active'),
          isNull(branches.archivedAt),
          isNull(brands.archivedAt),
          isNull(organizations.archivedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async emailAvailable(email: string) {
    const rows = await this.transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows.length === 0;
  }
  async bindEmail(email: string, now: Date) {
    const rows = await this.transaction
      .update(users)
      .set({ email, updatedAt: now })
      .where(and(eq(users.id, this.actor.userId), isNull(users.email)))
      .returning({ id: users.id });
    if (!rows.length) throw new DomainError('INVALID_CREDENTIALS', 401, 'Verification unavailable');
    await this.verifyEmail(now);
    await this.audit.platform(this.transaction, {
      actorUserId: this.actor.userId,
      actorRole: 'self',
      action: 'auth.email_associated',
      targetType: 'user',
      targetId: this.actor.userId,
      after: { emailVerified: true },
      createdAt: now,
    });
  }
}
export class EmailAssociationRepository implements EmailAssociationStore {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async transaction<T>(
    actor: Actor,
    work: (transaction: EmailAssociationTransaction) => Promise<T>,
  ) {
    try {
      return await this.database.transaction(async (transaction) => {
        await lockActor(transaction, actor, this.clock);
        const [identity] = await transaction
          .select({
            id: users.id,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            passwordHash: users.passwordHash,
            accountStatus: users.accountStatus,
          })
          .from(users)
          .where(eq(users.id, actor.userId))
          .for('update');
        return work(new LockedEmailAssociation(transaction, identity, actor, this.audit));
      });
    } catch (error) {
      if (identityUniqueFailure(error))
        throw new DomainError('INVALID_CREDENTIALS', 401, 'Verification unavailable');
      throw error;
    }
  }
}
