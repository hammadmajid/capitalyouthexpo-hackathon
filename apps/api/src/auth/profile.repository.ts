import { and, eq, isNull } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  branches,
  brands,
  customerProfiles,
  managerAssignments,
  organizations,
  users,
  type Database,
} from '@hsm/db';
import { DomainError, selfProfileSchema } from '@hsm/contracts';
export class ProfileRepository {
  constructor(
    private readonly database: Database,
    private readonly profileReviews = false,
  ) {}
  async read(userId: string) {
    const [user] = await this.database
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        cnicLast4: users.cnicLast4,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
    const customers = await this.database
      .select({ id: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1);
    const owners = await this.database
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.archivedAt)))
      .limit(1);
    const managerOf = await this.database
      .select({ branchId: branches.id, branchName: branches.name })
      .from(managerAssignments)
      .innerJoin(branches, eq(branches.id, managerAssignments.branchId))
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(
        and(
          eq(managerAssignments.userId, userId),
          eq(managerAssignments.status, 'active'),
          isNull(branches.archivedAt),
          isNull(brands.archivedAt),
          isNull(organizations.archivedAt),
        ),
      );
    const [admin] = await this.database
      .select({ isRoot: adminAccounts.isRoot })
      .from(adminAccounts)
      .where(and(eq(adminAccounts.userId, userId), eq(adminAccounts.status, 'active')))
      .limit(1);
    const roles = admin
      ? await this.database
          .select({ role: adminRoleGrants.role })
          .from(adminRoleGrants)
          .where(and(eq(adminRoleGrants.adminUserId, userId), isNull(adminRoleGrants.revokedAt)))
      : [];
    return selfProfileSchema.parse({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        cnicLast4: user.cnicLast4,
      },
      ...(this.profileReviews ? { features: { profileReviews: true } } : {}),
      capabilities: {
        customer: customers.length > 0,
        owner: owners.length > 0,
        managerOf,
        admin: admin ? { isRoot: admin.isRoot, roles: roles.map((grant) => grant.role) } : null,
      },
    });
  }
}
