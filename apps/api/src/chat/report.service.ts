import { z } from 'zod';
import {
  chatReportInputSchema,
  chatReportPageQuerySchema,
  chatReportSchema,
  chatSafetyAccessSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { ChatReportRepository } from './report.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class ChatReportService {
  constructor(
    private readonly repository: ChatReportRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  create(actor: Actor, key: string, body: unknown, branch?: string, conversation?: string) {
    const input = chatReportInputSchema.parse(body),
      branchId = branch ? id.parse(branch) : undefined,
      conversationId = conversation ? id.parse(conversation) : undefined;
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: branchId
          ? 'POST /branches/:branchId/conversations/:conversationId/reports'
          : 'POST /me/reports',
        status: 201,
      },
      {
        branchId: branchId ?? null,
        conversationId: conversationId ?? null,
        messageId: input.targetId,
      },
      input,
      chatReportSchema,
      (tx) => this.repository.authorize(tx, actor, input, branchId, conversationId),
      () => this.repository.create(requireTransaction(), actor, input, branchId, conversationId),
    );
  }
  list(actor: Actor, input: unknown) {
    return this.repository.list(actor, chatReportPageQuerySchema.parse(input));
  }
  context(actor: Actor, reportId: string, input: unknown) {
    return this.repository.context(
      actor,
      id.parse(reportId),
      chatSafetyAccessSchema.parse(input).justification,
    );
  }
}
