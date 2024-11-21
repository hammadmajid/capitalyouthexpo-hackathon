import { and, eq } from 'drizzle-orm';
import { files, notificationOutbox, type Database } from '@hsm/db';
import { DomainError, type Upload } from '@hsm/contracts';
import { scanFile } from '@hsm/files';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import type { FileRecord, FileStore, FileTransaction } from './store.js';
class LockedFiles implements FileTransaction {
  constructor(
    private readonly database: Transaction,
    private readonly actor: Actor,
    private readonly bucket: string,
    private readonly writer: AuditWriter,
    private readonly clock: () => Date,
  ) {}
  async read(id: string): Promise<FileRecord> {
    const [row] = await this.database
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.uploadedBy, this.actor.userId),
          eq(files.bucket, this.bucket),
          eq(files.visibility, 'private'),
        ),
      )
      .for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'File unavailable');
    return { ...scanFile(row), sha256: row.sha256 };
  }
  async create(id: string, key: string, upload: Upload) {
    await this.database.insert(files).values({
      id,
      uploadedBy: this.actor.userId,
      bucket: this.bucket,
      visibility: 'private',
      objectKey: key,
      mimeType: upload.mimeType,
      sizeBytes: BigInt(upload.sizeBytes),
      purpose: upload.purpose,
    });
  }
  async queue(file: FileRecord) {
    await this.database
      .insert(notificationOutbox)
      .values({
        eventType: 'files.scan',
        channel: 'internal',
        recipientUserId: this.actor.userId,
        payload: { fileId: file.id },
        dedupeKey: 'files.scan:' + file.id,
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
  }
  async reject(file: FileRecord) {
    await this.database
      .update(files)
      .set({ scanStatus: 'rejected', sha256: null })
      .where(eq(files.id, file.id));
  }
  async acceptAvatar(file: FileRecord, objectKey: string, sha256: Buffer) {
    await this.database
      .update(files)
      .set({ scanStatus: 'clean', objectKey, sha256 })
      .where(eq(files.id, file.id));
  }
  audit(file: FileRecord) {
    return this.writer.sensitive(this.database, {
      actorUserId: this.actor.userId,
      subjectUserId: file.uploadedBy,
      resource: 'private_document',
      resourceId: file.id,
      purpose: 'Self private file download',
      createdAt: this.clock(),
    });
  }
}
export class FileRepository implements FileStore {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly writer = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  transaction<T>(actor: Actor, work: (transaction: FileTransaction) => Promise<T>) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      return work(new LockedFiles(transaction, actor, this.bucket, this.writer, this.clock));
    });
  }
}
