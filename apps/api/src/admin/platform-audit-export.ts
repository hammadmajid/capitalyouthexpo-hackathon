import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { platformAuditLog, type Database } from '@hsm/db';
import {
  addRentDays,
  csvCell,
  platformAuditExportQuerySchema,
  platformAuditItemSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockAdmin, platformAudit } from './scope.js';
const start = (value: string) => new Date(value + 'T00:00:00+05:00');
// AUD-001 RPT-001: bounded metadata export; append audit within same authorized transaction.
export function exportPlatformAudit(
  database: Database,
  actor: Actor,
  query: unknown,
  clock: () => Date,
) {
  const input = platformAuditExportQuerySchema.parse(query);
  return database.transaction(async (tx) => {
    const scope = await lockAdmin(tx, actor, 'root', clock);
    const rows = await tx
      .select({
        id: platformAuditLog.id,
        actorId: platformAuditLog.actorUserId,
        actorRole: platformAuditLog.actorRole,
        action: platformAuditLog.action,
        targetType: platformAuditLog.targetType,
        targetId: platformAuditLog.targetId,
        createdAt: platformAuditLog.createdAt,
      })
      .from(platformAuditLog)
      .where(
        and(
          input.actorId ? eq(platformAuditLog.actorUserId, input.actorId) : undefined,
          input.action ? eq(platformAuditLog.action, input.action) : undefined,
          input.targetType ? eq(platformAuditLog.targetType, input.targetType) : undefined,
          input.from ? gte(platformAuditLog.createdAt, start(input.from)) : undefined,
          input.to ? lt(platformAuditLog.createdAt, start(addRentDays(input.to, 1n))) : undefined,
        ),
      )
      .orderBy(desc(platformAuditLog.createdAt), desc(platformAuditLog.id))
      .limit(5001);
    const page = rows
      .slice(0, 5000)
      .map((row) =>
        platformAuditItemSchema.parse({
          ...row,
          id: row.id.toString(),
          createdAt: row.createdAt.toISOString(),
        }),
      );
    const columns = [
      'id',
      'actorId',
      'actorRole',
      'action',
      'targetType',
      'targetId',
      'createdAt',
    ] as const;
    const body =
      [
        columns.map(csvCell).join(','),
        ...page.map((row) => columns.map((key) => csvCell(row[key] ?? '')).join(',')),
      ].join('\r\n') + '\r\n';
    await platformAudit(
      tx,
      scope,
      {
        action: 'audit.exported',
        targetType: 'user',
        targetId: actor.userId,
        after: { format: 'csv', rows: page.length, truncated: rows.length > 5000 },
      },
      clock(),
    );
    return { body, truncated: rows.length > 5000, filename: 'hsm-platform-audit.csv' };
  });
}
