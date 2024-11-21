import { and, desc, eq, lt } from 'drizzle-orm';
import { platformAuditLog, type Database } from '@hsm/db';
import {
  institutionHistoryPageSchema,
  institutionHistoryQuerySchema,
  institutionInputSchema,
  stayIdentifierSchema,
  DomainError,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
const fields = [
  'name',
  'shortName',
  'cityId',
  'areaId',
  'address',
  'latitude',
  'longitude',
  'aliases',
  'isActive',
  'publicApproved',
] as const;
const approvalValues = ['created', 'preserved', 'approved', 'withdrawn', 'reapproved'] as const;
function project(value: unknown) {
  if (!value || typeof value !== 'object' || !('institution' in value)) return null;
  const parsed = institutionInputSchema.safeParse(value.institution);
  return parsed.success ? parsed.data : null;
}
export class InstitutionHistoryService {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, target: unknown, query: unknown) {
    const id = stayIdentifierSchema.parse(target),
      input = institutionHistoryQuerySchema.parse(query);
    if (input.cursor && BigInt(input.cursor) > 9223372036854775807n)
      throw new DomainError('VALIDATION_FAILED', 400, 'Invalid history cursor');
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      const rows = await tx
        .select({
          id: platformAuditLog.id,
          actorId: platformAuditLog.actorUserId,
          createdAt: platformAuditLog.createdAt,
          before: platformAuditLog.before,
          after: platformAuditLog.after,
        })
        .from(platformAuditLog)
        .where(
          and(
            eq(platformAuditLog.targetId, id),
            eq(platformAuditLog.targetType, 'place'),
            eq(platformAuditLog.action, 'institution.saved'),
            input.cursor ? lt(platformAuditLog.id, BigInt(input.cursor)) : undefined,
          ),
        )
        .orderBy(desc(platformAuditLog.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return institutionHistoryPageSchema.parse({
        data: page.map((row) => {
          const before = project(row.before),
            after = project(row.after);
          const metadata = row.after;
          const reason =
            metadata &&
            typeof metadata === 'object' &&
            'reason' in metadata &&
            typeof metadata.reason === 'string'
              ? metadata.reason
              : null;
          const previousRevision =
            metadata &&
            typeof metadata === 'object' &&
            'previousRevision' in metadata &&
            typeof metadata.previousRevision === 'string'
              ? metadata.previousRevision
              : null;
          const approval =
            metadata && typeof metadata === 'object' && 'approval' in metadata
              ? metadata.approval
              : undefined;
          return {
            revision: String(row.id),
            previousRevision,
            actorId: row.actorId,
            createdAt: row.createdAt.toISOString(),
            reason,
            before,
            after,
            changedFields: fields.filter(
              (field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]),
            ),
            approval: approvalValues.find((v) => v === approval) ?? 'legacy',
          };
        }),
        nextCursor: rows.length > input.limit ? String(page.at(-1)?.id) : null,
      });
    });
  }
}
