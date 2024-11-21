import { z } from 'zod';
import { StorageSizeMismatch } from './storage.js';
import { FileRejected, validateContent } from './content.js';
import { quarantineKey, verifiedKey } from './keys.js';
import type { PrivateStorage, VirusScanner } from './ports.js';
import { InvalidScanJob, type ScanLease, type ScanStore, type ScanResult } from './scan-store.js';
const leaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('files.scan'),
    channel: z.literal('internal'),
    recipientUserId: z.string().uuid(),
    payload: z.object({ fileId: z.string().uuid() }).strict(),
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export class FileScanService {
  constructor(
    private readonly store: ScanStore,
    private readonly storage: PrivateStorage,
    private readonly scanner: VirusScanner,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private async cleanup(key: string) {
    // A cleanup outage may leave a private orphan; it must not undo a committed verdict.
    try {
      await this.storage.remove(key);
    } catch {
      /* SEC-003: never expose provider details. */
    }
  }
  async deliver(input: ScanLease) {
    const parsed = leaseSchema.safeParse({
      id: input.id,
      eventType: input.eventType,
      channel: input.channel,
      recipientUserId: input.recipientUserId,
      payload: input.payload,
      leaseToken: input.leaseToken,
      leaseExpiresAt: input.leaseExpiresAt,
    });
    if (!parsed.success) throw new InvalidScanJob();
    const lease = parsed.data;
    if (lease.leaseExpiresAt <= this.clock()) return;
    const file = await this.store.read(lease.payload.fileId);
    if (!file || file.uploadedBy !== lease.recipientUserId) throw new InvalidScanJob();
    if (file.scanStatus !== 'pending') {
      await this.store.complete(lease, file, undefined, this.clock());
      return;
    }
    if (file.objectKey !== quarantineKey(file.upload.purpose, file.id)) throw new InvalidScanJob();
    let result: ScanResult, snapshotKey: string | undefined;
    try {
      const bytes = await this.storage.read(file.objectKey, file.upload.sizeBytes);
      const sha256 = await validateContent(file.upload, bytes);
      if ((await this.scanner.scan(bytes)) === 'clean') {
        snapshotKey = verifiedKey(file.upload.purpose, file.id);
        await this.storage.putVerified(snapshotKey, file.upload.mimeType, bytes);
        result = { status: 'clean', objectKey: snapshotKey, sha256 };
      } else result = { status: 'rejected' };
    } catch (error) {
      if (error instanceof FileRejected || error instanceof StorageSizeMismatch)
        result = { status: 'rejected' };
      else {
        if (snapshotKey) await this.cleanup(snapshotKey);
        throw error;
      }
    }
    let accepted: boolean;
    try {
      accepted = await this.store.complete(lease, file, result, this.clock());
    } catch (error) {
      if (snapshotKey) await this.cleanup(snapshotKey);
      throw error;
    }
    if (accepted) await this.cleanup(file.objectKey);
    else if (snapshotKey) await this.cleanup(snapshotKey);
  }
}
