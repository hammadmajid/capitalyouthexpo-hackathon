import { z } from 'zod';
import type { Database } from '@hsm/db';
import { DomainError, downloadResponseSchema } from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { ownerBookingEvidence } from './evidence-access.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingEvidenceService {
  constructor(
    private readonly database: Database,
    private readonly storage: Pick<PrivateStorage, 'presignDownload'>,
    private readonly bucket: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  download(actor: Actor, branchId: string, documentId: string) {
    const branch = identifier.parse(branchId),
      document = identifier.parse(documentId);
    return this.database.transaction(async (transaction) => {
      const { file } = await ownerBookingEvidence(
        transaction,
        actor,
        branch,
        document,
        this.bucket,
        this.clock,
      );
      let url: string;
      try {
        url = await this.storage.presignDownload(file.objectKey, file.id, file.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      await lockActor(transaction, actor, this.clock);
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
}
