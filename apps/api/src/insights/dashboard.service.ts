import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  bookingHistory,
  bookings,
  branches,
  conversations,
  managerAssignments,
  managerInventoryGrants,
  notifications,
  organizations,
  stays,
  visitRequests,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  addRentDays,
  analyticsQuerySchema,
  analyticsSchema,
  dashboardQuerySchema,
  managerDashboardSchema,
  ownerDashboardSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { karachiToday } from '../services/dates.js';
import { lockStaffScope } from '../services/scope.js';
import { occupancyTotals } from '../stay/occupancy.repository.js';
import { actionCounts, activeResidents, confirmedBookings, rentMonth } from './metrics.js';
import { dashboardQueue } from './dashboard-queues.service.js';
import { dashboardOwnedBranches } from './dashboard-owner.repository.js';
import { dashboardDetails, sumDashboardDetails } from './dashboard-details.js';
const SLOW_RESPONSE_HOURS = 24;
type Totals = Awaited<ReturnType<typeof occupancyTotals>>;
type Rent = Awaited<ReturnType<typeof rentMonth>>;
type Actions = Awaited<ReturnType<typeof actionCounts>>;
function sum<T extends Record<string, number | string>>(rows: T[], keys: (keyof T)[], base: T): T {
  return rows.reduce((total, row) => {
    const next = { ...total };
    for (const key of keys)
      next[key] = ((total[key] as number) + (row[key] as number)) as T[keyof T];
    return next;
  }, base);
}
// OWN-001..004: only branches of organizations the caller owns (archived ones excluded).
export async function ownedBranches(tx: Transaction, actor: Actor, only?: string) {
  const rows = await tx
    .select({
      id: branches.id,
      name: branches.name,
      verificationStatus: branches.verificationStatus,
    })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(
      and(
        eq(organizations.ownerUserId, actor.userId),
        isNull(branches.archivedAt),
        isNull(organizations.archivedAt),
        only ? eq(branches.id, only) : undefined,
      ),
    )
    .orderBy(asc(branches.name))
    .limit(100);
  if (only && !rows.length) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
  return rows;
}
export class DashboardService {
  queue(actor: Actor, branchId: unknown, kind: unknown, query: unknown) {
    return dashboardQueue(this.database, actor, branchId, kind, query, this.clock);
  }
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  owner(actor: Actor, query: unknown) {
    const input = dashboardQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      const now = this.clock(),
        today = karachiToday(now),
        month = input.month ?? today.slice(0, 7);
      const owned = await dashboardOwnedBranches(tx, actor, input.branchId);
      const offset = input.cursor ? owned.findIndex((branch) => branch.id === input.cursor) + 1 : 0;
      if (input.cursor && !offset)
        throw new DomainError('NOT_FOUND', 404, 'Dashboard page unavailable');
      const rows = [];
      for (const branch of owned) {
        const beds = await occupancyTotals(tx, branch.id, today, now);
        rows.push({
          branchId: branch.id,
          branchName: branch.name,
          verificationStatus: branch.verificationStatus,
          beds,
          occupancyPercent: beds.beds ? Math.round((beds.occupied / beds.beds) * 1000) / 10 : 0,
          activeResidents: await activeResidents(tx, branch.id),
          confirmedBookings: await confirmedBookings(tx, branch.id),
          rent: await rentMonth(tx, branch.id, month, today),
          actions: await actionCounts(tx, branch.id, today),
          details: await dashboardDetails(tx, branch.id, actor.userId, month, today),
          subscription: 'deferred' as const,
        });
      }
      const zeroBeds: Totals = {
        beds: 0,
        occupied: 0,
        available: 0,
        reserved: 0,
        blocked: 0,
        unavailable: 0,
      };
      const zeroRent: Rent = {
        month,
        invoices: 0,
        expectedPaisa: 0,
        collectedPaisa: 0,
        outstandingPaisa: 0,
        overdueInvoices: 0,
      };
      const zeroActions: Actions = {
        pendingBookings: 0,
        pendingProofs: 0,
        openComplaints: 0,
        upcomingCheckouts: 0,
        overdueInvoices: 0,
      };
      return ownerDashboardSchema.parse({
        asOf: today,
        month,
        branches: rows.slice(offset, offset + input.limit),
        nextCursor:
          rows.length > offset + input.limit
            ? (rows[offset + input.limit - 1]?.branchId ?? null)
            : null,
        totals: {
          details: sumDashboardDetails(
            rows.map((row) => row.details),
            month,
          ),
          beds: sum(
            rows.map((row) => row.beds),
            Object.keys(zeroBeds) as (keyof Totals)[],
            zeroBeds,
          ),
          activeResidents: rows.reduce((total, row) => total + row.activeResidents, 0),
          confirmedBookings: rows.reduce((total, row) => total + row.confirmedBookings, 0),
          rent: sum(
            rows.map((row) => row.rent),
            ['invoices', 'expectedPaisa', 'collectedPaisa', 'outstandingPaisa', 'overdueInvoices'],
            zeroRent,
          ),
          actions: sum(
            rows.map((row) => row.actions),
            Object.keys(zeroActions) as (keyof Actions)[],
            zeroActions,
          ),
        },
      });
    });
  }
  // MGRD-001..005: the assigned branch only; no owner-wide or other-branch data.
  manager(actor: Actor, branchId: unknown) {
    const branch = stayIdentifierSchema.parse(branchId);
    return this.database.transaction(async (tx) => {
      const scope = await lockStaffScope(tx, actor, branch, [], this.clock);
      const now = this.clock(),
        today = karachiToday(now),
        tomorrow = addRentDays(today, 1n);
      const finance =
        scope.actorRole === 'owner' ||
        (await this.hasGrant(tx, actor.userId, branch, 'finance_view'));
      const n = sql<number>`count(*)::int`;
      const one = (rows: { count: number }[]) => rows[0]?.count ?? 0;
      return managerDashboardSchema.parse({
        branchId: branch,
        asOf: today,
        today: {
          moveIns: one(
            await tx
              .select({ count: n })
              .from(bookings)
              .where(
                and(
                  eq(bookings.branchId, branch),
                  eq(bookings.state, 'confirmed'),
                  eq(bookings.moveInDate, today),
                ),
              ),
          ),
          checkouts: one(
            await tx
              .select({ count: n })
              .from(stays)
              .where(
                and(
                  eq(stays.branchId, branch),
                  inArray(stays.state, ['active', 'notice_given', 'checkout_pending']),
                  eq(stays.expectedLeaveDate, today),
                ),
              ),
          ),
          visits: one(
            await tx
              .select({ count: n })
              .from(visitRequests)
              .where(
                and(
                  eq(visitRequests.branchId, branch),
                  inArray(visitRequests.status, ['approved', 'rescheduled']),
                  gte(visitRequests.requestedStart, new Date(today + 'T00:00:00+05:00')),
                  lt(visitRequests.requestedStart, new Date(tomorrow + 'T00:00:00+05:00')),
                ),
              ),
          ),
        },
        queue: await actionCounts(tx, branch, today),
        beds: await occupancyTotals(tx, branch, today, now),
        unreadNotices: one(
          await tx
            .select({ count: n })
            .from(notifications)
            .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt))),
        ),
        rent: finance ? await rentMonth(tx, branch, today.slice(0, 7), today) : null,
      });
    });
  }
  // RPT-003/004: funnel and response times from booking facts; views/searches are not stored.
  analytics(actor: Actor, query: unknown) {
    const input = analyticsQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      const from = new Date(input.from + 'T00:00:00+05:00'),
        to = new Date(addRentDays(input.to, 1n) + 'T00:00:00+05:00');
      const n = sql<number>`count(*)::int`;
      const one = (rows: { count: number }[]) => rows[0]?.count ?? 0;
      const data = [];
      for (const branch of await ownedBranches(tx, actor)) {
        const window = and(
          eq(bookings.branchId, branch.id),
          gte(bookings.createdAt, from),
          lt(bookings.createdAt, to),
        );
        const states = await tx
          .select({ state: bookings.state, count: n })
          .from(bookings)
          .where(window)
          .groupBy(bookings.state);
        const of = (state: string) => states.find((row) => row.state === state)?.count ?? 0;
        const decisions = await tx
          .select({
            hours: sql<number>`extract(epoch from (min(${bookingHistory.createdAt}) - ${bookings.createdAt})) / 3600`,
          })
          .from(bookings)
          .innerJoin(bookingHistory, eq(bookingHistory.bookingId, bookings.id))
          .where(
            and(
              window,
              eq(bookingHistory.previousState, 'pending_request'),
              inArray(bookingHistory.nextState, ['confirmed', 'rejected']),
            ),
          )
          .groupBy(bookings.id, bookings.createdAt);
        const hours = decisions.map((row) => Number(row.hours));
        const slow = hours.filter((value) => value > SLOW_RESPONSE_HOURS).length;
        const expired = of('expired');
        data.push({
          branchId: branch.id,
          branchName: branch.name,
          listingViews: null,
          searches: null,
          conversations: one(
            await tx
              .select({ count: n })
              .from(conversations)
              .where(
                and(
                  eq(conversations.branchId, branch.id),
                  gte(conversations.createdAt, from),
                  lt(conversations.createdAt, to),
                ),
              ),
          ),
          visitRequests: one(
            await tx
              .select({ count: n })
              .from(visitRequests)
              .where(
                and(
                  eq(visitRequests.branchId, branch.id),
                  gte(visitRequests.createdAt, from),
                  lt(visitRequests.createdAt, to),
                ),
              ),
          ),
          bookingRequests: states.reduce((total, row) => total + row.count, 0),
          confirmed: of('confirmed'),
          rejected: of('rejected'),
          expired,
          checkedIn: one(
            await tx
              .select({ count: n })
              .from(stays)
              .where(
                and(
                  eq(stays.branchId, branch.id),
                  gte(stays.checkedInAt, from),
                  lt(stays.checkedInAt, to),
                ),
              ),
          ),
          averageResponseHours: hours.length
            ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10
            : null,
          slowResponses: slow,
          // Advisory only: no automatic penalty follows from these warnings.
          warnings: [
            ...(expired >= 3 ? ['Several booking requests expired without a decision'] : []),
            ...(slow >= 3 ? ['Several booking decisions took longer than a day'] : []),
          ],
        });
      }
      return analyticsSchema.parse({
        from: input.from,
        to: input.to,
        branches: data,
        coverage: { listingViews: 'not_collected', searches: 'not_collected' },
      });
    });
  }
  private async hasGrant(
    tx: Transaction,
    userId: string,
    branchId: string,
    permission: 'finance_view',
  ) {
    const [row] = await tx
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .innerJoin(
        managerInventoryGrants,
        eq(managerInventoryGrants.assignmentId, managerAssignments.id),
      )
      .where(
        and(
          eq(managerAssignments.userId, userId),
          eq(managerAssignments.branchId, branchId),
          eq(managerAssignments.status, 'active'),
          eq(managerInventoryGrants.permission, permission),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
