import { and, eq, gt } from 'drizzle-orm';
import { reports } from '@hsm/db';
import { DomainError, type ChatReportInput, type chatReportPageQuerySchema } from '@hsm/contracts';
import type { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { ChatRepository } from './repository.js';
import { authorizeSafety, reportedMessage } from './report-access.js';
import { authorizeChatScope } from './access.js';
import { safetyContext } from './report-context.js';
import { projectChatReport } from './report.projection.js';
export class ChatReportRepository {
  constructor(readonly chat: ChatRepository) {}
  async authorize(
    tx: Transaction,
    actor: Actor,
    input: ChatReportInput,
    branchId?: string,
    conversationId?: string,
  ) {
    await reportedMessage(tx, this.chat, actor, input.targetId, branchId, conversationId);
    return true;
  }
  async create(
    tx: Transaction,
    actor: Actor,
    input: ChatReportInput,
    branchId?: string,
    conversationId?: string,
  ) {
    const source = await reportedMessage(
      tx,
      this.chat,
      actor,
      input.targetId,
      branchId,
      conversationId,
    );
    if (source.deletedAt) throw new DomainError('NOT_FOUND', 404, 'Message unavailable');
    const [row] = await tx
      .insert(reports)
      .values({
        reporterUserId: actor.userId,
        targetType: 'chat_message',
        targetId: source.id,
        reason: input.reason,
        details: input.details ?? null,
        createdAt: this.chat.clock(),
      })
      .returning();
    if (!row) throw new Error('Report insert unavailable');
    if (branchId) {
      const scope = await authorizeChatScope(tx, actor, this.chat.clock, branchId);
      if (!scope) throw new Error('Report scope unavailable');
      await new AuditWriter().hostel(tx, {
        actorUserId: actor.userId,
        actorRole: scope.actorRole,
        organizationId: scope.organizationId,
        branchId,
        action: 'chat.message.reported',
        targetType: 'report',
        targetId: row.id,
        after: {
          messageId: source.id,
          conversationId: source.conversationId,
          reason: input.reason,
        },
        createdAt: this.chat.clock(),
      });
    }
    return projectChatReport(row);
  }
  list(actor: Actor, query: z.infer<typeof chatReportPageQuerySchema>) {
    return this.chat.database.transaction(async (tx) => {
      await authorizeSafety(tx, actor, this.chat.clock);
      const rows = await tx
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.targetType, 'chat_message'),
            query.status ? eq(reports.status, query.status) : undefined,
            query.cursor ? gt(reports.id, query.cursor) : undefined,
          ),
        )
        .orderBy(reports.id)
        .limit(query.limit + 1);
      const data = rows.slice(0, query.limit).map(projectChatReport);
      return { data, nextCursor: rows.length > query.limit ? (data.at(-1)?.id ?? null) : null };
    });
  }
  context(actor: Actor, reportId: string, justification: string) {
    return this.chat.database.transaction((tx) =>
      safetyContext(tx, actor, reportId, justification, this.chat.clock),
    );
  }
}
