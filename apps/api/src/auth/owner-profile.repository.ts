import { and, eq, isNull } from 'drizzle-orm';
import { organizations, ownerProfiles, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from './actor-lock.js';
import { ownedProfileAttachment } from './profile-attachments.js';
import { identityConflictField, identityUniqueFailure } from './identity-conflict.js';
import type {
  OwnerIdentity,
  OwnerProfilePersistence,
  OwnerProfileStore,
  OwnerProfileTransaction,
  ProtectedOwnerCnic,
} from './owner-profile.store.js';
class LockedOwnerProfile implements OwnerProfileTransaction {
  constructor(
    private readonly database: Transaction,
    private readonly actor: Actor,
    readonly identity: OwnerIdentity | undefined,
    private readonly bucket: string,
    private readonly audit: AuditWriter,
  ) {}
  file(id: string) {
    return ownedProfileAttachment(this.database, this.actor.userId, this.bucket, id);
  }
  private async organization(input: OwnerProfilePersistence, now: Date) {
    const [existing] = await this.database
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(eq(organizations.ownerUserId, this.actor.userId), isNull(organizations.archivedAt)),
      )
      .limit(1);
    if (existing) return { id: existing.id, created: false };
    const [created] = await this.database
      .insert(organizations)
      .values({
        ownerUserId: this.actor.userId,
        name: input.organizationName ?? 'Personal hostel organization',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: organizations.id });
    if (!created) throw new Error('Owner organization unavailable');
    return { id: created.id, created: true };
  }
  private async updateIdentity(
    input: OwnerProfilePersistence,
    protectedCnic: ProtectedOwnerCnic,
    now: Date,
  ) {
    await this.database
      .update(users)
      .set({
        fullName: input.fullName,
        phoneE164: input.phone,
        ...protectedCnic,

        updatedAt: now,
        ...(this.identity?.phoneE164 !== input.phone ? { phoneVerifiedAt: null } : {}),
        ...(input.profilePhotoFileId !== undefined
          ? { profilePhotoFileId: input.profilePhotoFileId }
          : {}),
      })
      .where(eq(users.id, this.actor.userId));
  }
  async save(input: OwnerProfilePersistence, protectedCnic: ProtectedOwnerCnic, now: Date) {
    // CHG-031: Owner profile photos attach directly, like Customer photos (CHG-027).
    await this.updateIdentity(input, protectedCnic, now);
    const [previous] = await this.database
      .select({
        acceptedAt: ownerProfiles.agreementAcceptedAt,
        completedAt: ownerProfiles.profileCompletedAt,
      })
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, this.actor.userId));
    const fields = {
      ...(input.cnicFrontFileId ? { cnicFrontFileId: input.cnicFrontFileId } : {}),
      ...(input.cnicBackFileId ? { cnicBackFileId: input.cnicBackFileId } : {}),
      address: input.address,
      agreementVersion: input.agreementVersion,
      agreementAcceptedAt: previous?.acceptedAt ?? now,
      profileCompletedAt: previous?.completedAt ?? now,
      updatedAt: now,
    };
    await this.database
      .insert(ownerProfiles)
      .values({ userId: this.actor.userId, ...fields, createdAt: now })
      .onConflictDoUpdate({ target: ownerProfiles.userId, set: fields });
    const organization = await this.organization(input, now);
    await this.audit.platform(this.database, {
      actorUserId: this.actor.userId,
      actorRole: 'self',
      action: 'owner.profile.save',
      targetType: 'owner_profile',
      targetId: this.actor.userId,
      after: {
        completed: true,
        organizationId: organization.id,
        organizationCreated: organization.created,
        agreementVersion: input.agreementVersion,
      },
      createdAt: now,
    });
  }
}
export class OwnerProfileRepository implements OwnerProfileStore {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async transaction<T>(actor: Actor, work: (transaction: OwnerProfileTransaction) => Promise<T>) {
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
            cnicHash: users.cnicHash,
            phoneE164: users.phoneE164,
          })
          .from(users)
          .where(eq(users.id, actor.userId))
          .for('update');
        return work(new LockedOwnerProfile(database, actor, identity, this.bucket, this.audit));
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
