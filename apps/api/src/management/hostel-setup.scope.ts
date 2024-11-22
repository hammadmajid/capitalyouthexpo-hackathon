import { and, eq, isNull } from 'drizzle-orm';
import { brands, organizations, ownerProfiles, users } from '@hsm/db';
import { DomainError, pakistaniMobileSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
export type SetupTarget = { kind: 'organization' | 'brand'; id: string };
const unavailable = () => new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
export async function lockSetupScope(database: Transaction, actor: Actor, target: SetupTarget) {
  if (target.kind === 'organization') {
    const [row] = await database
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.id, target.id),
          eq(organizations.ownerUserId, actor.userId),
          isNull(organizations.archivedAt),
        ),
      )
      .for('update');
    if (!row) throw unavailable();
    return row.id;
  }
  const [row] = await database
    .select({ organizationId: brands.organizationId })
    .from(brands)
    .innerJoin(organizations, eq(organizations.id, brands.organizationId))
    .where(
      and(
        eq(brands.id, target.id),
        eq(organizations.ownerUserId, actor.userId),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .for('update');
  if (!row) throw unavailable();
  return row.organizationId;
}
export async function requireOwnerSetupEvidence(
  database: Transaction,
  actor: Actor,
  bucket: string,
  requireDocuments = true,
) {
  const [row] = await database
    .select({
      fullName: users.fullName,
      phone: users.phoneE164,
      email: users.email,
      verifiedAt: users.emailVerifiedAt,
      passwordHash: users.passwordHash,
      cnicHash: users.cnicHash,
      cnicEncrypted: users.cnicEncrypted,
      frontId: ownerProfiles.cnicFrontFileId,
      backId: ownerProfiles.cnicBackFileId,
      agreementVersion: ownerProfiles.agreementVersion,
    })
    .from(ownerProfiles)
    .innerJoin(users, eq(users.id, ownerProfiles.userId))
    .where(eq(ownerProfiles.userId, actor.userId))
    .for('update');
  if (
    !row?.email ||
    row.fullName.trim().length < 2 ||
    !pakistaniMobileSchema.safeParse(row.phone).success ||
    !row.verifiedAt ||
    !row.passwordHash ||
    !row.cnicHash ||
    !row.cnicEncrypted ||
    (requireDocuments && (!row.frontId || !row.backId)) ||
    row.agreementVersion !== 'owner-foundation-v1'
  )
    throw new DomainError('FORBIDDEN', 403, 'Complete Owner profile before hostel setup');
  for (const id of [row.frontId, row.backId]) {
    if (!id) {
      if (requireDocuments)
        throw new DomainError('FORBIDDEN', 403, 'Owner verification evidence required');
      continue;
    }
    await requireSetupFile(database, actor, bucket, id, 'verification_document');
  }
}
export async function requireSetupFile(
  database: Transaction,
  actor: Actor,
  bucket: string,
  id: string,
  purpose: 'verification_document' | 'listing_photo',
) {
  const file = await ownedProfileAttachment(database, actor.userId, bucket, id);
  if (!file || file.purpose !== purpose)
    throw new DomainError('NOT_FOUND', 404, 'Hostel attachment unavailable');
  if (file.scanStatus !== 'clean')
    throw new DomainError('CONFLICT', 409, 'Hostel attachment is not ready');
}
