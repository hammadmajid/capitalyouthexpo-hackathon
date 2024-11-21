import type { reports } from '@hsm/db';
import { chatReportSchema } from '@hsm/contracts';
export function projectChatReport(row: typeof reports.$inferSelect) {
  return chatReportSchema.parse({
    id: row.id,
    reporterUserId: row.reporterUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}
