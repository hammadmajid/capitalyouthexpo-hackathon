import { eq } from 'drizzle-orm';
import { customerProfiles, ownerProfiles, organizations, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
export class ProfileDetailsRepository {
  constructor(
    private readonly database: Database,
    private readonly clock = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  read(actor: Actor) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      const [user] = await database
        .select({
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
          phone: users.phoneE164,
          gender: users.gender,
          cnicLast4: users.cnicLast4,
          profilePhotoFileId: users.profilePhotoFileId,
        })
        .from(users)
        .where(eq(users.id, actor.userId));
      if (!user) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
      const [customer] = await database
        .select({
          age: customerProfiles.age,
          institution: customerProfiles.institutionText,
          completedAt: customerProfiles.profileCompletedAt,
        })
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, actor.userId));
      const [owner] = await database
        .select({
          address: ownerProfiles.address,
          cnicFrontFileId: ownerProfiles.cnicFrontFileId,
          cnicBackFileId: ownerProfiles.cnicBackFileId,
          agreementVersion: ownerProfiles.agreementVersion,
          agreementAcceptedAt: ownerProfiles.agreementAcceptedAt,
          completedAt: ownerProfiles.profileCompletedAt,
        })
        .from(ownerProfiles)
        .where(eq(ownerProfiles.userId, actor.userId));
      const [organization] = owner
        ? await database
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.ownerUserId, actor.userId))
            .limit(1)
        : [];
      await this.audit.sensitive(database, {
        actorUserId: actor.userId,
        subjectUserId: actor.userId,
        resource: 'self_profile_details',
        resourceId: actor.userId,
        purpose: 'Self profile editing',
        createdAt: this.clock(),
      });
      return {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        phone: user.phone,
        gender: user.gender,
        cnicLast4: user.cnicLast4,
        profilePhotoFileId: user.profilePhotoFileId,
        customer: customer
          ? {
              age: customer.age,
              institution: customer.institution,
              completed: customer.completedAt !== null,
            }
          : null,
        owner: owner
          ? {
              address: owner.address,
              organizationName: organization?.name ?? null,
              cnicFrontFileId: owner.cnicFrontFileId,
              cnicBackFileId: owner.cnicBackFileId,
              agreementVersion: owner.agreementVersion,
              agreementAcceptedAt: owner.agreementAcceptedAt.toISOString(),
              completed: owner.completedAt !== null,
            }
          : null,
      };
    });
  }
}
