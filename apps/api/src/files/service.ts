import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DomainError,
  avatarMaxBytes,
  uploadSchema,
  uploadResponseSchema,
  fileStatusResponseSchema,
  downloadResponseSchema,
  type Upload,
} from '@hsm/contracts';
import {
  FileRejected,
  StorageSizeMismatch,
  quarantineKey,
  validateContent,
  verifiedKey,
  type PrivateStorage,
} from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { requireSensitiveAccess } from '../authorization/sensitive.policy.js';
import type { FileRecord, FileStore } from './store.js';
const identifier = z.string().uuid();
function status(file: FileRecord) {
  return fileStatusResponseSchema.parse({
    fileId: file.id,
    scanStatus: file.scanStatus,
    mimeType: file.upload.mimeType,
    sizeBytes: file.upload.sizeBytes,
  });
}
function sameSnapshot(current: FileRecord, previous: FileRecord) {
  return (
    current.objectKey === previous.objectKey &&
    current.upload.purpose === previous.upload.purpose &&
    current.upload.mimeType === previous.upload.mimeType &&
    current.upload.sizeBytes === previous.upload.sizeBytes
  );
}
async function provider<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new DomainError('INTERNAL', 503, 'Storage unavailable');
  }
}
export class FileService {
  constructor(
    private readonly store: FileStore,
    private readonly storage: PrivateStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async upload(actor: Actor, input: Upload) {
    const upload = uploadSchema.parse(input),
      id = randomUUID();
    const key = quarantineKey(upload.purpose, id);
    return this.store.transaction(actor, async (transaction) => {
      await transaction.create(id, key, upload);
      const uploadUrl = await provider(() => this.storage.presignUpload(key, upload));
      return uploadResponseSchema.parse({
        fileId: id,
        uploadUrl,
        headers: { 'content-type': upload.mimeType },
        expiresAt: new Date(this.clock().getTime() + 300000).toISOString(),
      });
    });
  }
  read(actor: Actor, id: string) {
    identifier.parse(id);
    return this.store.transaction(actor, async (transaction) => status(await transaction.read(id)));
  }
  async complete(actor: Actor, id: string) {
    identifier.parse(id);
    const previous = await this.store.transaction(actor, (transaction) => transaction.read(id));
    if (previous.scanStatus !== 'pending') return status(previous);
    if (previous.objectKey !== quarantineKey(previous.upload.purpose, previous.id))
      throw new DomainError('CONFLICT', 409, 'File unavailable');
    let invalid = false,
      unavailable = false;
    let avatar: { objectKey: string; sha256: Buffer } | undefined;
    try {
      if (previous.upload.purpose === 'avatar' && previous.upload.sizeBytes > avatarMaxBytes)
        throw new FileRejected('SIZE_MISMATCH');
      const bytes = await this.storage.read(previous.objectKey, previous.upload.sizeBytes);
      const sha256 = await validateContent(previous.upload, bytes);
      if (previous.upload.purpose === 'avatar') {
        const objectKey = verifiedKey('avatar', previous.id);
        await this.storage.putVerified(objectKey, previous.upload.mimeType, bytes);
        avatar = { objectKey, sha256 };
      }
    } catch (error) {
      if (error instanceof FileRejected || error instanceof StorageSizeMismatch) invalid = true;
      else unavailable = true;
    }
    let acceptedAvatar = false;
    const result = await this.store.transaction(actor, async (transaction) => {
      const current = await transaction.read(id);
      if (current.scanStatus !== 'pending') return status(current);
      if (!sameSnapshot(current, previous))
        throw new DomainError('CONFLICT', 409, 'File snapshot changed');
      if (unavailable) throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      if (invalid) {
        await transaction.reject(current);
        return status({ ...current, scanStatus: 'rejected', sha256: null });
      }
      if (avatar) {
        await transaction.acceptAvatar(current, avatar.objectKey, avatar.sha256);
        acceptedAvatar = true;
        return status({ ...current, scanStatus: 'clean' });
      }
      await transaction.queue(current);
      return status(current);
    });
    if (avatar) {
      // The committed pointer is immutable. Cleanup is outside the response path.
      void this.storage
        .remove(acceptedAvatar ? previous.objectKey : avatar.objectKey)
        .catch(() => undefined);
    }
    if (invalid && result.scanStatus === 'rejected')
      throw new DomainError('VALIDATION_FAILED', 400, 'File content rejected');
    return result;
  }
  download(actor: Actor, id: string) {
    identifier.parse(id);
    return this.store.transaction(actor, async (transaction) => {
      const file = await transaction.read(id);
      if (
        file.scanStatus !== 'clean' ||
        file.sha256?.length !== 32 ||
        !file.objectKey.startsWith('private/' + file.upload.purpose + '/' + file.id + '/')
      )
        throw new DomainError('CONFLICT', 409, 'File unavailable');
      requireSensitiveAccess({
        actorId: actor.userId,
        subjectId: z.string().uuid().parse(file.uploadedBy),
        actorActive: true,
        resource: 'private_document',
        ownerOrAssignedManager: false,
        approvedBookingOrWalkIn: false,
        rootActive: false,
        authorizedSafetyCase: false,
        justification: '',
      });
      await transaction.audit(file);
      const url = await provider(() =>
        this.storage.presignDownload(file.objectKey, file.id, file.upload.mimeType),
      );
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
  close() {
    this.storage.close();
  }
}
