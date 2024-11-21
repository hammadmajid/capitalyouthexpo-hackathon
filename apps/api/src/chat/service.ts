import { z } from 'zod';
import {
  chatMessageInputSchema,
  chatMessageSchema,
  chatPageQuerySchema,
  conversationReadSchema,
  conversationSchema,
  createConversationSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { ChatRepository } from './repository.js';
import { DomainError, downloadResponseSchema } from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import { readChatFile } from './attachments.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter } from '../audit/writer.js';
import { ChatReportService } from './report.service.js';
import { ChatReportRepository } from './report.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class ChatService {
  readonly reporting: ChatReportService;
  constructor(
    private readonly repository: ChatRepository,
    private readonly idempotency: IdempotencyService,
    private readonly storage?: Pick<PrivateStorage, 'presignDownload'>,
  ) {
    this.reporting = new ChatReportService(new ChatReportRepository(repository), idempotency);
  }
  download(actor: Actor, conversation: string, file: string, branch?: string) {
    const conversationId = id.parse(conversation),
      fileId = id.parse(file),
      branchId = branch ? id.parse(branch) : undefined;
    return this.repository.database.transaction(async (tx) => {
      await this.repository.authorize(tx, actor, branchId, conversationId);
      const target = await readChatFile(tx, conversationId, fileId, this.repository.bucket);
      if (!this.storage) throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      let url: string;
      try {
        url = await this.storage.presignDownload(target.objectKey, target.id, target.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      await lockActor(tx, actor, this.repository.clock);
      await new AuditWriter().sensitive(tx, {
        actorUserId: actor.userId,
        subjectUserId: target.uploadedBy,
        resource: 'private_document',
        resourceId: fileId,
        purpose: 'Participant chat attachment download',
        createdAt: this.repository.clock(),
      });
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.repository.clock().getTime() + 60000).toISOString(),
      });
    });
  }
  list(actor: Actor, query: unknown, branch?: string) {
    return this.repository.list(
      actor,
      chatPageQuerySchema.parse(query),
      branch ? id.parse(branch) : undefined,
    );
  }
  messages(actor: Actor, conversation: string, query: unknown, branch?: string) {
    return this.repository.messages(
      actor,
      id.parse(conversation),
      chatPageQuerySchema.parse(query),
      branch ? id.parse(branch) : undefined,
    );
  }
  create(actor: Actor, key: string, body: unknown) {
    const input = createConversationSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /me/conversations', status: 200 },
      { branchId: input.branchId },
      input,
      conversationSchema,
      (tx) => this.repository.authorize(tx, actor),
      () => this.repository.create(requireTransaction(), actor, input.branchId),
    );
  }
  send(actor: Actor, key: string, conversation: string, body: unknown, branch?: string) {
    const conversationId = id.parse(conversation),
      branchId = branch ? id.parse(branch) : undefined,
      input = chatMessageInputSchema.parse(body);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: branchId
          ? 'POST /branches/:branchId/conversations/:conversationId/messages'
          : 'POST /me/conversations/:conversationId/messages',
        status: 201,
      },
      { conversationId, branchId: branchId ?? null },
      input,
      chatMessageSchema,
      (tx) => this.repository.authorize(tx, actor, branchId, conversationId),
      () => this.repository.send(requireTransaction(), actor, conversationId, input, branchId),
    );
  }
  read(actor: Actor, key: string, conversation: string, branch?: string) {
    const conversationId = id.parse(conversation),
      branchId = branch ? id.parse(branch) : undefined;
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: branchId
          ? 'POST /branches/:branchId/conversations/:conversationId/read'
          : 'POST /me/conversations/:conversationId/read',
        status: 200,
      },
      { conversationId, branchId: branchId ?? null },
      {},
      conversationReadSchema,
      (tx) => this.repository.authorize(tx, actor, branchId, conversationId),
      () => this.repository.markRead(requireTransaction(), actor, conversationId, branchId),
    );
  }
}
