import { and, eq } from 'drizzle-orm';
import { files, stays, users, type Database } from '@hsm/db';
import { DomainError, stayResidentPhotoSchema } from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { requireSensitiveAccess } from '../authorization/sensitive.policy.js';
import { AuditWriter } from '../audit/writer.js';
export type ResidentPhotoReader = (
  actor: Actor,
  stayId: string,
  branchId?: string,
) => Promise<{
  url: string | null;
  expiresAt: string | null;
}>;
export function readStayResidentPhoto(
  database: Database,
  storage: PrivateStorage,
  bucket: string,
  actor: Actor,
  stayId: string,
  clock: () => Date,
  branchId?: string,
) {
  return database.transaction(async (tx) => {
    await lockActor(tx, actor, clock);
    if (branchId) await lockInventoryScope(tx, actor, branchId, 'stay_manage');
    const [stay] = await tx
      .select({
        userId: stays.userId,
        source: stays.source,
        bookingId: stays.bookingId,
        photoId: users.profilePhotoFileId,
      })
      .from(stays)
      .leftJoin(users, eq(users.id, stays.userId))
      .where(
        and(
          eq(stays.id, stayId),
          branchId ? eq(stays.branchId, branchId) : eq(stays.userId, actor.userId),
        ),
      )
      .for('share', { of: stays });
    if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
    await lockActor(tx, actor, clock);
    if (!stay.userId || !stay.photoId) return { url: null, expiresAt: null };
    const [file] = await tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, stay.photoId),
          eq(files.uploadedBy, stay.userId),
          eq(files.purpose, 'avatar'),
          eq(files.visibility, 'private'),
          eq(files.bucket, bucket),
        ),
      );
    if (
      !file ||
      file.scanStatus !== 'clean' ||
      file.sha256?.length !== 32 ||
      !file.objectKey.startsWith('private/avatar/' + file.id + '/') ||
      !file.mimeType.startsWith('image/')
    )
      return { url: null, expiresAt: null };
    requireSensitiveAccess({
      actorId: actor.userId,
      subjectId: stay.userId,
      actorActive: true,
      resource: 'private_document',
      ownerOrAssignedManager: branchId !== undefined,
      approvedBookingOrWalkIn: stay.source === 'manual' || stay.bookingId !== null,
      rootActive: false,
      authorizedSafetyCase: false,
      justification: '',
    });
    await new AuditWriter().sensitive(tx, {
      actorUserId: actor.userId,
      subjectUserId: stay.userId,
      resource: 'private_document',
      resourceId: file.id,
      purpose: 'Authorized stay resident photo',
      createdAt: clock(),
    });
    let url: string;
    try {
      url = await storage.presignDownload(file.objectKey, file.id, file.mimeType);
    } catch {
      throw new DomainError('INTERNAL', 503, 'Photo storage unavailable');
    }
    return stayResidentPhotoSchema.parse({
      url,
      expiresAt: new Date(clock().getTime() + 60000).toISOString(),
    });
  });
}
