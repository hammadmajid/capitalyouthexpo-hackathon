import { and, eq } from 'drizzle-orm';
import { files, residents } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';

export async function requireAdmissionCnicPhoto(
  tx: Transaction,
  actor: Actor,
  fileId: string,
  bucket?: string,
) {
  if (!bucket) throw new DomainError('INTERNAL', 503, 'Private document storage unavailable');
  const [file] = await tx
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.uploadedBy, actor.userId),
        eq(files.bucket, bucket),
        eq(files.visibility, 'private'),
        eq(files.purpose, 'resident_document'),
      ),
    )
    .for('share');
  if (
    !file ||
    !['image/jpeg', 'image/png'].includes(file.mimeType) ||
    !file.objectKey.startsWith('private/resident_document/' + fileId + '/')
  )
    throw new DomainError('NOT_FOUND', 404, 'CNIC photo unavailable');
  if (file.scanStatus !== 'clean' || file.sha256?.length !== 32)
    throw new DomainError('CONFLICT', 409, 'CNIC photo is not ready');
}

export async function attachAdmissionCnicPhoto(
  tx: Transaction,
  actor: Actor,
  scope: { organizationId: string; actorRole: string },
  branchId: string,
  residentId: string,
  fileId: string,
  now: Date,
) {
  const [updated] = await tx
    .update(residents)
    .set({ cnicPhotoFileId: fileId, updatedAt: now })
    .where(
      and(
        eq(residents.id, residentId),
        eq(residents.branchId, branchId),
        eq(residents.createdByUserId, actor.userId),
      ),
    )
    .returning({ id: residents.id });
  if (!updated) throw new DomainError('CONFLICT', 409, 'Resident photo attachment unavailable');
  await new AuditWriter().hostel(tx, {
    organizationId: scope.organizationId,
    branchId,
    actorUserId: actor.userId,
    actorRole: scope.actorRole,
    action: 'resident.cnic_photo.attached',
    targetType: 'resident',
    targetId: residentId,
    after: { hasCnicPhoto: true },
    createdAt: now,
  });
}
