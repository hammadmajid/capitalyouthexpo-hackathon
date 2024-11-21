import { and, eq } from 'drizzle-orm';
import { files, notificationOutbox, type Database } from '@hsm/db';
import { fileMimeSchema, storedUploadSchema, type Upload } from '@hsm/contracts';
import { z } from 'zod';
import {
  InvalidScanJob,
  type ScanStore,
  type ScanLease,
  type ScanFile,
  type ScanResult,
} from './scan-store.js';
const suffixes: Record<Upload['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
export function scanFile(row: typeof files.$inferSelect): ScanFile {
  const mime = fileMimeSchema.parse(row.mimeType);
  const upload = storedUploadSchema.parse({
    purpose: row.purpose,
    fileName: 'upload.' + suffixes[mime],
    mimeType: mime,
    sizeBytes: Number(row.sizeBytes),
  });
  return {
    id: row.id,
    uploadedBy: row.uploadedBy,
    objectKey: row.objectKey,
    scanStatus: row.scanStatus,
    upload,
  };
}
export class FileScanRepository implements ScanStore {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async read(id: string) {
    const [row] = await this.database
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.bucket, this.bucket), eq(files.visibility, 'private')));
    return row ? scanFile(row) : undefined;
  }
  complete(lease: ScanLease, snapshot: ScanFile, result: ScanResult | undefined, now: Date) {
    return this.database.transaction(async (transaction) => {
      // SEC-003: all file workflows lock the file before its outbox row.
      const [file] = await transaction
        .select()
        .from(files)
        .where(eq(files.id, snapshot.id))
        .for('update');
      const [job] = await transaction
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, lease.id))
        .for('update');
      const publicationTime = new Date(Math.max(now.getTime(), this.clock().getTime()));
      if (
        !file ||
        !job ||
        job.leaseToken !== lease.leaseToken ||
        !job.leaseExpiresAt ||
        job.leaseExpiresAt <= publicationTime ||
        !['pending', 'failed'].includes(job.status)
      )
        return false;
      const payload = z.object({ fileId: z.string().uuid() }).strict().safeParse(job.payload);
      if (
        !payload.success ||
        payload.data.fileId !== file.id ||
        job.channel !== 'internal' ||
        job.eventType !== 'files.scan' ||
        job.recipientUserId !== file.uploadedBy ||
        file.uploadedBy !== snapshot.uploadedBy ||
        file.bucket !== this.bucket ||
        file.visibility !== 'private'
      )
        throw new InvalidScanJob();
      const pending = file.scanStatus === 'pending';
      if (
        pending &&
        (!result ||
          file.objectKey !== snapshot.objectKey ||
          file.mimeType !== snapshot.upload.mimeType ||
          file.sizeBytes !== BigInt(snapshot.upload.sizeBytes) ||
          file.purpose !== snapshot.upload.purpose)
      )
        return false;
      if (pending && result)
        await transaction
          .update(files)
          .set(
            result.status === 'clean'
              ? { scanStatus: 'clean', objectKey: result.objectKey, sha256: result.sha256 }
              : { scanStatus: 'rejected', sha256: null },
          )
          .where(eq(files.id, file.id));
      await transaction
        .update(notificationOutbox)
        .set({
          status: 'sent',
          sentAt: publicationTime,
          providerMessageId: 'files.scan',
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(eq(notificationOutbox.id, job.id));
      return pending;
    });
  }
}
