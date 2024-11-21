import { and, eq, isNull, sql } from 'drizzle-orm';
import { branches, organizations, ownerProfiles, users } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
// Verification authority never implies permission to enumerate unrelated owner files.
export async function verificationRecord(tx: Transaction, branchId: string) {
  const [row] = await tx
    .select({
      branchId: branches.id,
      branchName: branches.name,
      organizationName: organizations.name,
      ownerId: organizations.ownerUserId,
      status: branches.verificationStatus,
      updatedAt: branches.updatedAt,
      completenessScore: branches.completenessScore,
      category: branches.category,
      addressLine: branches.addressLine,
      description: branches.description,
      cityId: branches.cityId,
      areaId: branches.areaId,
      propertyTier: branches.propertyTier,
      establishmentYear: branches.establishmentYear,
      publicPhone: branches.publicPhone,
      publicEmail: branches.publicEmail,
      showPublicContact: branches.showPublicContact,
      latitude: sql<number | null>`ST_Y(${branches.location}::geometry)`,
      longitude: sql<number | null>`ST_X(${branches.location}::geometry)`,
      fullName: users.fullName,
      cnicLast4: users.cnicLast4,
      profileCompletedAt: ownerProfiles.profileCompletedAt,
      frontId: ownerProfiles.cnicFrontFileId,
      backId: ownerProfiles.cnicBackFileId,
    })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .leftJoin(ownerProfiles, eq(ownerProfiles.userId, organizations.ownerUserId))
    .where(
      and(eq(branches.id, branchId), isNull(branches.archivedAt), isNull(organizations.archivedAt)),
    )
    .for('share', { of: branches });
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Verification request unavailable');
  return row;
}
export type VerificationRecord = Awaited<ReturnType<typeof verificationRecord>>;
