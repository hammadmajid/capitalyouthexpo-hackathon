import { and, eq, inArray, isNull } from 'drizzle-orm';
import { files, listingMedia, ownerProfiles } from '@hsm/db';
import {
  DomainError,
  downloadResponseSchema,
  verificationEvidenceAccessSchema,
} from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { AdminScope } from './scope.js';
import { platformAudit } from './scope.js';
import type { VerificationRecord } from './verification-record.js';
export type VerificationStorage = {
  bucket: string;
  storage: Pick<PrivateStorage, 'presignDownload'>;
};
export async function attachedEvidence(tx: Transaction, record: VerificationRecord) {
  const ids = [record.frontId, record.backId].filter((value): value is string => value !== null);
  if (!ids.length) return [];
  return tx
    .select()
    .from(files)
    .where(
      and(
        inArray(files.id, ids),
        eq(files.uploadedBy, record.ownerId),
        eq(files.purpose, 'verification_document'),
        eq(files.visibility, 'private'),
      ),
    )
    .for('share');
}
function verified(file: typeof files.$inferSelect, bucket: string) {
  return (
    file.scanStatus === 'clean' &&
    file.sha256?.length === 32 &&
    file.bucket === bucket &&
    file.visibility === 'private' &&
    file.objectKey.startsWith('private/' + file.purpose + '/' + file.id + '/')
  );
}
export function projectEvidence(
  file: typeof files.$inferSelect,
  record: VerificationRecord,
  bucket?: string,
) {
  return {
    fileId: file.id,
    side: file.id === record.frontId ? ('front' as const) : ('back' as const),
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    available: Boolean(bucket && verified(file, bucket)),
  };
}
export async function verificationEvidence(
  tx: Transaction,
  scope: AdminScope,
  record: VerificationRecord,
  fileId: string,
  input: unknown,
  options: VerificationStorage | undefined,
  now: Date,
) {
  const { justification } = verificationEvidenceAccessSchema.parse(input);
  if (record.status === 'draft')
    throw new DomainError('CONFLICT', 409, 'Submit the branch before evidence review');
  let file: typeof files.$inferSelect | undefined;
  if (fileId === record.frontId || fileId === record.backId) {
    // Lock and re-prove the current profile association: a replaced identity document
    // cannot remain authorized merely because it was joined earlier in this request.
    const [profile] = await tx
      .select({ frontId: ownerProfiles.cnicFrontFileId, backId: ownerProfiles.cnicBackFileId })
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, record.ownerId))
      .for('share');
    if (!profile || (fileId !== profile.frontId && fileId !== profile.backId))
      throw new DomainError('NOT_FOUND', 404, 'Verification evidence unavailable');
    file = (await attachedEvidence(tx, record)).find((item) => item.id === fileId);
  } else {
    const [photo] = await tx
      .select({ file: files })
      .from(listingMedia)
      .innerJoin(files, eq(files.id, listingMedia.fileId))
      .where(
        and(
          eq(listingMedia.branchId, record.branchId),
          eq(listingMedia.fileId, fileId),
          isNull(listingMedia.archivedAt),
          eq(files.purpose, 'listing_photo'),
        ),
      )
      .limit(1)
      .for('share');
    file = photo?.file;
  }
  if (!file || !options || !verified(file, options.bucket))
    throw new DomainError('NOT_FOUND', 404, 'Verification evidence unavailable');
  await new AuditWriter().sensitive(tx, {
    actorUserId: scope.userId,
    subjectUserId: record.ownerId,
    resource:
      file.purpose === 'verification_document'
        ? 'owner_verification_document'
        : 'verification_listing_photo',
    resourceId: fileId,
    purpose: justification,
    createdAt: now,
  });
  await platformAudit(
    tx,
    scope,
    {
      action: 'verification.evidence_access',
      targetType: 'branch',
      targetId: record.branchId,
      after: { fileId },
    },
    now,
  );
  let url: string;
  try {
    url = await options.storage.presignDownload(file.objectKey, file.id, file.mimeType);
  } catch {
    throw new DomainError('INTERNAL', 503, 'Verification evidence temporarily unavailable');
  }
  return downloadResponseSchema.parse({
    url,
    expiresAt: new Date(now.getTime() + 60000).toISOString(),
  });
}
