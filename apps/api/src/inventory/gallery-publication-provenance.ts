import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { hostelAuditLog } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';

// Immutable audit provenance only adds a current permission requirement.
// Fixed predicates match the partial index even with a generic prepared plan.
export function publishedGalleryVersion(
  transaction: Transaction,
  branchId: string,
  mediaId: string,
  version: string,
) {
  return transaction
    .select({ id: hostelAuditLog.id })
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, branchId),
        sql`${hostelAuditLog.targetType} = 'listing_media'`,
        eq(hostelAuditLog.targetId, mediaId),
        sql`${hostelAuditLog.action} = 'listing.image.changed'`,
        eq(sql<string>`${hostelAuditLog.before}->>'version'`, version),
        isNotNull(sql`${hostelAuditLog.before}->>'publishedAt'`),
      ),
    )
    .limit(1);
}
