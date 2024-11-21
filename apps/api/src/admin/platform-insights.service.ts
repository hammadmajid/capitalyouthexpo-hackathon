import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  addRentDays,
  platformAnalyticsQuerySchema,
  platformAuditPageSchema,
  platformAuditPosition,
  platformAuditQuerySchema,
  platformOverviewSchema,
} from '@hsm/contracts';
import {
  announcements,
  brands,
  cities,
  branches,
  conversations,
  customerProfiles,
  managerAssignments,
  organizations,
  ownerProfiles,
  platformAuditLog,
  reports,
  stays,
  supportTickets,
  users,
  visitRequests,
  type Database,
} from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
import { platformWindowMetrics } from './platform-window-metrics.js';
import { publicListingCondition } from '../marketplace/query.js';
import { exportPlatformAudit } from './platform-audit-export.js';
const count = sql<number>`count(*)::int`;
const first = (rows: { count: number }[]) => rows[0]?.count ?? 0;
const start = (value: string) => new Date(value + 'T00:00:00+05:00');
// RPT-003 / SEC-003: global SQL aggregates; no resident/financial row projection.
export class PlatformInsightsService {
  constructor(
    private readonly database: Database,
    private readonly clock = () => new Date(),
  ) {}
  exportAudit(actor: Actor, query: unknown) {
    return exportPlatformAudit(this.database, actor, query, this.clock);
  }
  overview(actor: Actor, query: unknown) {
    const input = platformAnalyticsQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      const live = and(
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      );
      const [branchCounts] = await tx
        .select({
          count,
          published: sql<number>`count(*) filter (where ${publicListingCondition()})::int`,
          pending: sql<number>`count(*) filter (where ${branches.verificationStatus} in ('submitted','under_review','changes_requested'))::int`,
        })
        .from(branches)
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .innerJoin(brands, eq(brands.id, branches.brandId))
        .leftJoin(cities, eq(cities.id, branches.cityId))
        .where(live);
      const [support] = await tx
        .select({ count })
        .from(supportTickets)
        .where(inArray(supportTickets.status, ['open', 'in_progress', 'waiting_for_user']));
      const [moderation] = await tx
        .select({ count })
        .from(reports)
        .where(inArray(reports.status, ['open', 'investigating']));
      const notices = await tx
        .select({ state: announcements.status, count })
        .from(announcements)
        .groupBy(announcements.status);
      const snapshot = {
        users: first(await tx.select({ count }).from(users)),
        customers: first(await tx.select({ count }).from(customerProfiles)),
        owners: first(await tx.select({ count }).from(ownerProfiles)),
        activeBranches: branchCounts?.count ?? 0,
        publishedListings: branchCounts?.published ?? 0,
        activeManagers: first(
          await tx
            .select({ count: sql<number>`count(distinct ${managerAssignments.userId})::int` })
            .from(managerAssignments)
            .where(eq(managerAssignments.status, 'active')),
        ),
        verificationPending: branchCounts?.pending ?? 0,
        supportPending: support?.count ?? 0,
        moderationPending: moderation?.count ?? 0,
        announcements: {
          scheduled: notices.find((r) => r.state === 'scheduled')?.count ?? 0,
          sent: notices.find((r) => r.state === 'sent')?.count ?? 0,
          cancelled: notices.find((r) => r.state === 'cancelled')?.count ?? 0,
        },
      };
      const from = start(input.from),
        to = start(addRentDays(input.to, 1n));
      const facts = await platformWindowMetrics(tx, from, to);
      const window = {
        ...facts,
        registeredUsers: first(
          await tx
            .select({ count })
            .from(users)
            .where(and(gte(users.createdAt, from), lt(users.createdAt, to))),
        ),
        conversations: first(
          await tx
            .select({ count })
            .from(conversations)
            .where(and(gte(conversations.createdAt, from), lt(conversations.createdAt, to))),
        ),
        visitRequests: first(
          await tx
            .select({ count })
            .from(visitRequests)
            .where(and(gte(visitRequests.createdAt, from), lt(visitRequests.createdAt, to))),
        ),
        checkedIn: first(
          await tx
            .select({ count })
            .from(stays)
            .where(and(gte(stays.checkedInAt, from), lt(stays.checkedInAt, to))),
        ),
      };
      return platformOverviewSchema.parse({
        generatedAt: this.clock().toISOString(),
        timezone: 'Asia/Karachi',
        ...input,
        snapshot,
        window,
        coverage: {
          searches: 'not_collected',
          listingViews: 'not_collected',
          commercialRetention: 'deferred',
          occupancyFreshness: 'not_collected',
        },
      });
    });
  }
  audit(actor: Actor, query: unknown) {
    const input = platformAuditQuerySchema.parse(query);
    const position = input.cursor ? platformAuditPosition(input.cursor) : undefined;
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
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
            position
              ? or(
                  lt(platformAuditLog.createdAt, new Date(position.at)),
                  and(
                    eq(platformAuditLog.createdAt, new Date(position.at)),
                    lt(platformAuditLog.id, BigInt(position.id)),
                  ),
                )
              : undefined,
            input.actorId ? eq(platformAuditLog.actorUserId, input.actorId) : undefined,
            input.action ? eq(platformAuditLog.action, input.action) : undefined,
            input.targetType ? eq(platformAuditLog.targetType, input.targetType) : undefined,
            input.from ? gte(platformAuditLog.createdAt, start(input.from)) : undefined,
            input.to ? lt(platformAuditLog.createdAt, start(addRentDays(input.to, 1n))) : undefined,
          ),
        )
        .orderBy(desc(platformAuditLog.createdAt), desc(platformAuditLog.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return platformAuditPageSchema.parse({
        data: page.map((row) => ({
          ...row,
          id: row.id.toString(),
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > input.limit && last
            ? last.createdAt.toISOString() + '|' + last.id.toString()
            : null,
      });
    });
  }
}
