import { and, asc, count, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import { chatAttachments, chatMessages, reports } from '@hsm/db';
import { chatSafetyContextSchema, DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { authorizeSafety } from './report-access.js';
export async function safetyContext(
  tx: Transaction,
  actor: Actor,
  reportId: string,
  justification: string,
  clock: () => Date,
) {
  const role = await authorizeSafety(tx, actor, clock);
  const [report] = await tx
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.targetType, 'chat_message')))
    .for('share');
  if (!report) throw new DomainError('NOT_FOUND', 404, 'Report unavailable');
  const [target] = await tx
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, report.targetId))
    .for('share');
  if (!target) throw new DomainError('NOT_FOUND', 404, 'Reported source unavailable');
  const scope = eq(chatMessages.conversationId, target.conversationId);
  const before = await tx
    .select()
    .from(chatMessages)
    .where(and(scope, lt(chatMessages.id, target.id)))
    .orderBy(desc(chatMessages.id))
    .limit(2)
    .for('share');
  const after = await tx
    .select()
    .from(chatMessages)
    .where(and(scope, gt(chatMessages.id, target.id)))
    .orderBy(asc(chatMessages.id))
    .limit(2)
    .for('share');
  const messages = [
      ...before.reverse().filter((row) => !row.deletedAt),
      target,
      ...after.filter((row) => !row.deletedAt),
    ],
    ids = messages.map((row) => row.id);
  const attachments = await tx
    .select({ id: chatAttachments.messageId, total: count() })
    .from(chatAttachments)
    .where(inArray(chatAttachments.messageId, ids))
    .groupBy(chatAttachments.messageId);
  const counts = new Map(attachments.map((row) => [row.id, row.total]));
  const result = chatSafetyContextSchema.parse({
    reportId,
    reportedMessageId: target.id,
    messages: messages.map((row) => ({
      id: row.id,
      senderSide: row.senderSide,
      body: row.body,
      attachmentCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      removed: row.deletedAt !== null,
    })),
  });
  const audit = new AuditWriter();
  for (const subjectUserId of new Set(messages.map((row) => row.senderUserId)))
    await audit.sensitive(tx, {
      actorUserId: actor.userId,
      subjectUserId,
      resource: 'chat_report_context',
      resourceId: reportId,
      purpose: justification,
      createdAt: clock(),
    });
  await audit.platform(tx, {
    actorUserId: actor.userId,
    actorRole: role,
    action: 'access_private_chat',
    targetType: 'report',
    targetId: reportId,
    after: { reportedMessageId: target.id, messageIds: ids },
    createdAt: clock(),
  });
  return result;
}
