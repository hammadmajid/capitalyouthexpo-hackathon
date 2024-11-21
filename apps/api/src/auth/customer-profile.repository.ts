import { eq } from 'drizzle-orm';
import { customerProfiles, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from './actor-lock.js';
import { ownedProfileAttachment } from './profile-attachments.js';
import { identityConflictField, identityUniqueFailure } from './identity-conflict.js';
import { matchCustomerResident } from './customer-resident-link.js';
import type {
  CustomerIdentity,
  CustomerProfileInput,
  CustomerProfileStore,
  CustomerProfileTransaction,
} from './customer-profile.store.js';
class LockedCustomerProfile implements CustomerProfileTransaction {
  constructor(
    private readonly database: Transaction,
    private readonly actor: Actor,
    readonly identity: CustomerIdentity | undefined,
    private readonly bucket: string,
    private readonly audit: AuditWriter,
  ) {}
  file(id: string) {
    return ownedProfileAttachment(this.database, this.actor.userId, this.bucket, id);
  }
  private async updateIdentity(input: CustomerProfileInput, now: Date) {
    const [previous] = await this.database
      .select({ phone: users.phoneE164 })
      .from(users)
      .where(eq(users.id, this.actor.userId));
    await this.database
      .update(users)
      .set({
        fullName: input.fullName,
        gender: input.gender,
        phoneE164: input.phone,
        updatedAt: now,
        ...(previous?.phone !== input.phone ? { phoneVerifiedAt: null } : {}),
        ...(input.profilePhotoFileId !== undefined
          ? { profilePhotoFileId: input.profilePhotoFileId }
          : {}),
      })
      .where(eq(users.id, this.actor.userId));
  }
  async save(input: CustomerProfileInput, now: Date) {
    await this.updateIdentity(input, now);
    const [previous] = await this.database
      .select({ completedAt: customerProfiles.profileCompletedAt })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, this.actor.userId));
    const fields = {
      age: input.age,
      institutionText: input.institution ?? null,
      profileCompletedAt: previous?.completedAt ?? now,
    };
    await this.database
      .insert(customerProfiles)
      .values({ userId: this.actor.userId, ...fields })
      .onConflictDoUpdate({ target: customerProfiles.userId, set: fields });
    await matchCustomerResident(this.database, this.identity, input.phone, now);
    await this.audit.platform(this.database, {
      actorUserId: this.actor.userId,
      actorRole: 'self',
      action: 'customer.profile.save',
      targetType: 'customer_profile',
      targetId: this.actor.userId,
      after: { completed: true },
      createdAt: now,
    });
  }
}
export class CustomerProfileRepository implements CustomerProfileStore {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async transaction<T>(
    actor: Actor,
    work: (transaction: CustomerProfileTransaction) => Promise<T>,
  ) {
    try {
      return await this.database.transaction(async (database) => {
        await lockActor(database, actor, this.clock);
        const [identity] = await database
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            passwordHash: users.passwordHash,
            accountStatus: users.accountStatus,
            gender: users.gender,
          })
          .from(users)
          .where(eq(users.id, actor.userId))
          .for('update');
        return work(new LockedCustomerProfile(database, actor, identity, this.bucket, this.audit));
      });
    } catch (error) {
      if (identityUniqueFailure(error))
        throw new DomainError(
          'IDENTITY_EXISTS',
          409,
          'Identity already exists',
          identityConflictField(error),
        );
      throw error;
    }
  }
}
