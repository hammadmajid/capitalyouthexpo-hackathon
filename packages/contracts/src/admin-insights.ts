import { z } from 'zod';
import { calendarDateSchema as databaseDateSchema, instantSchema } from './dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';
const count = z.number().int().nonnegative();
const auditId = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
export function platformAuditPosition(cursor: string) {
  const parts = cursor.split('|');
  return z
    .object({ at: instantSchema, id: auditId })
    .strict()
    .parse({ at: parts.length === 2 ? parts[0] : undefined, id: parts[1] });
}
const auditCursor = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      platformAuditPosition(value);
      return true;
    } catch {
      return false;
    }
  });
export const platformAnalyticsQuerySchema = z
  .object({ from: databaseDateSchema, to: databaseDateSchema })
  .strict()
  .refine((q) => q.from <= q.to, 'From must be on or before to');
export const platformOverviewSchema = z
  .object({
    generatedAt: instantSchema,
    timezone: z.literal('Asia/Karachi'),
    from: databaseDateSchema,
    to: databaseDateSchema,
    snapshot: z
      .object({
        users: count,
        customers: count,
        owners: count,
        activeBranches: count,
        publishedListings: count,
        activeManagers: count,
        verificationPending: count,
        supportPending: count,
        moderationPending: count,
        announcements: z.object({ scheduled: count, sent: count, cancelled: count }).strict(),
      })
      .strict(),
    window: z
      .object({
        registeredUsers: count,
        bookingRequests: count,
        bookingStates: z.array(z.object({ state: z.string(), count }).strict()),
        conversations: count,
        visitRequests: count,
        checkedIn: count,
        respondedRequests: count,
        averageResponseHours: z.number().nonnegative().nullable(),
        slowResponses: count,
      })
      .strict(),
    coverage: z
      .object({
        searches: z.literal('not_collected'),
        listingViews: z.literal('not_collected'),
        commercialRetention: z.literal('deferred'),
        occupancyFreshness: z.literal('not_collected'),
      })
      .strict(),
  })
  .strict();
// AUD-001 / SEC-003: metadata only. No arbitrary payloads, contacts, IP or browser identifiers.
const auditFilters = {
  actorId: id.optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetType: z.string().trim().min(1).max(80).optional(),
  from: databaseDateSchema.optional(),
  to: databaseDateSchema.optional(),
};
export const platformAuditQuerySchema = z
  .object({
    cursor: auditCursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    ...auditFilters,
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, 'From must be on or before to');
export const platformAuditExportQuerySchema = z
  .object(auditFilters)
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, 'From must be on or before to');
export const platformAuditItemSchema = z
  .object({
    id: auditId,
    actorId: id.nullable(),
    actorRole: z.string(),
    action: z.string(),
    targetType: z.string(),
    targetId: id,
    createdAt: instantSchema,
  })
  .strict();
export const platformAuditPageSchema = z
  .object({ data: z.array(platformAuditItemSchema).max(100), nextCursor: auditCursor.nullable() })
  .strict();
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;
export type PlatformAuditItem = z.infer<typeof platformAuditItemSchema>;
