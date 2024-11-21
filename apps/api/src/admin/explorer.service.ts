import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  adminExplorerDetailSchema,
  adminExplorerKindSchema,
  adminExplorerPageSchema,
  adminExplorerQuerySchema,
  adminExplorerRecordSchema,
  adminExplorerSummarySchema,
  DomainError,
  stayIdentifierSchema,
  type AdminExplorerKind,
  type AdminExplorerQuery,
} from '@hsm/contracts';
import { type Database } from '@hsm/db';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
import { explorerRelations, explorerSource } from './explorer-source.js';
import {
  explorerNotices,
  explorerPaging,
  explorerPeriods,
  explorerScope,
  explorerSearch,
} from './explorer-query.js';
import { explorerProfile } from './explorer-profile.js';

function failure(error: unknown): never {
  if (error instanceof DomainError) throw error;
  throw new DomainError('INTERNAL', 503, 'Directory temporarily unavailable');
}
function allowedFilters(kind: AdminExplorerKind, query: AdminExplorerQuery) {
  if (
    (query.ownerId && !['hostels', 'branches', 'occupancy', 'payments'].includes(kind)) ||
    (query.managerId && !['branches', 'occupancy', 'payments'].includes(kind)) ||
    (query.parentId && ['users', 'owners', 'managers'].includes(kind))
  )
    throw new DomainError('VALIDATION_FAILED', 400, 'Filter does not apply to this directory');
}
function sourceFields(source: ReturnType<typeof explorerSource>) {
  return {
    id: sql`${source.id}`,
    name: sql`${source.name}`,
    status: sql`${source.status}`,
    parentId: sql`${source.parentId}`,
    createdAt: sql`${source.createdAt}`,
  };
}
function conditions(
  tx: Transaction,
  kind: AdminExplorerKind,
  query: AdminExplorerQuery,
  source: ReturnType<typeof explorerSource>,
) {
  return and(
    explorerSearch(
      kind === 'branches' && query.status === 'pending' ? { ...query, status: '' } : query,
      sourceFields(source),
    ),
    kind === 'branches' && query.status === 'pending'
      ? inArray(source.status, ['submitted', 'under_review', 'changes_requested'])
      : undefined,
    explorerRelations(
      tx,
      kind,
      sql`${kind === 'hostels' ? source.parentId : source.id}`,
      query.ownerId,
      query.managerId,
    ),
  );
}
async function aggregate(
  tx: Transaction,
  kind: AdminExplorerKind,
  query: AdminExplorerQuery,
  now: Date,
  since?: Date,
) {
  const source = explorerSource(tx, kind, now, since);
  const [result] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      quantity: sql<number>`coalesce(sum(${source.quantity}),0)::int`,
      amount: sql<string>`coalesce(sum(${source.amountPaisa}::numeric),0)::text`,
    })
    .from(source)
    .where(
      and(
        conditions(tx, kind, query, source),
        since ? gte(sql`${source.createdAt}`, since.toISOString()) : undefined,
      ),
    );
  return result ?? { count: 0, quantity: 0, amount: '0' };
}
export class AdminExplorerService {
  constructor(
    private readonly database: Database,
    private readonly clock = () => new Date(),
  ) {}
  list(actor: Actor, target: unknown, body: unknown) {
    const kind = adminExplorerKindSchema.parse(target),
      query = adminExplorerQuerySchema.parse(body);
    allowedFilters(kind, query);
    return this.database
      .transaction(
        async (tx) => {
          await lockAdmin(tx, actor, 'root', this.clock);
          const now = this.clock(),
            periods = explorerPeriods(now),
            since = periods[query.period];
          const source = explorerSource(tx, kind, now, since),
            fields = sourceFields(source);
          const paging = explorerPaging(query, explorerScope(kind, query), fields);
          const rows = await tx
            .select()
            .from(source)
            .where(
              and(
                conditions(tx, kind, query, source),
                since ? gte(sql`${source.createdAt}`, since.toISOString()) : undefined,
                paging.after,
              ),
            )
            .orderBy(...paging.order)
            .limit(query.limit + 1);
          const data = rows
            .slice(0, query.limit)
            .map((row) =>
              adminExplorerRecordSchema.parse({ ...row, createdAt: row.createdAt.toISOString() }),
            );
          const last = data.at(-1);
          const totals = await aggregate(tx, kind, query, now, since);
          const statistics = { month: 0, quarter: 0, year: 0, lifetime: 0 };
          for (const period of ['month', 'quarter', 'year', 'lifetime'] as const) {
            const value = await aggregate(tx, kind, query, now, periods[period]);
            statistics[period] = kind === 'payments' ? value.quantity : value.count;
          }
          const allSource = explorerSource(tx, kind, now);
          const statuses = await tx
            .selectDistinct({ status: allSource.status })
            .from(allSource)
            .orderBy(allSource.status);
          return adminExplorerPageSchema.parse({
            kind,
            generatedAt: now.toISOString(),
            timezone: 'Asia/Karachi',
            data,
            nextCursor: rows.length > query.limit && last ? paging.cursor(last) : null,
            totalCount: totals.count,
            statistics,
            statisticsLabel:
              kind === 'payments'
                ? 'Approved hostel-direct payments'
                : kind === 'occupancy'
                  ? 'Branches created (not historical occupancy)'
                  : ['users', 'owners', 'managers'].includes(kind)
                    ? 'Account registration cohorts'
                    : 'Records registered / created',
            statuses: statuses.map((row) => row.status),
            quantity: ['payments', 'occupancy'].includes(kind) ? totals.quantity : null,
            amountPaisa: kind === 'payments' ? totals.amount : null,
            notice: explorerNotices[kind],
          });
        },
        { isolationLevel: 'repeatable read' },
      )
      .catch(failure);
  }
  detail(actor: Actor, target: unknown, identifier: unknown) {
    const kind = adminExplorerKindSchema.parse(target),
      id = stayIdentifierSchema.parse(identifier);
    return this.database
      .transaction(
        async (tx) => {
          await lockAdmin(tx, actor, 'root', this.clock);
          const source = explorerSource(tx, kind, this.clock());
          const [row] = await tx.select().from(source).where(eq(source.id, id));
          if (!row) throw new DomainError('NOT_FOUND', 404, 'Directory record unavailable');
          const profile = await explorerProfile(tx, actor, kind, id, row.parentId);
          await new AuditWriter().platform(tx, {
            actorUserId: actor.userId,
            actorRole: 'root',
            action: 'directory.profile_viewed',
            targetType: kind,
            targetId: id,
            after: { kind },
            createdAt: this.clock(),
          });
          return adminExplorerDetailSchema.parse({
            kind,
            record: { ...row, createdAt: row.createdAt.toISOString() },
            ...profile,
            notice: explorerNotices[kind],
          });
        },
        { isolationLevel: 'repeatable read' },
      )
      .catch(failure);
  }
  summary(actor: Actor) {
    return this.database
      .transaction(
        async (tx) => {
          await lockAdmin(tx, actor, 'root', this.clock);
          const now = this.clock(),
            query = adminExplorerQuerySchema.parse({});
          const counts = {
            users: 0,
            owners: 0,
            managers: 0,
            hostels: 0,
            branches: 0,
            bookings: 0,
            complaints: 0,
            occupancy: 0,
            payments: 0,
            approvals: 0,
          };
          for (const kind of adminExplorerKindSchema.options) {
            const result = await aggregate(tx, kind, query, now);
            counts[kind] =
              kind === 'payments' || kind === 'occupancy' ? result.quantity : result.count;
          }
          counts.approvals = (
            await aggregate(tx, 'branches', { ...query, status: 'approved' }, now)
          ).count;
          return adminExplorerSummarySchema.parse({ generatedAt: now.toISOString(), counts });
        },
        { isolationLevel: 'repeatable read' },
      )
      .catch(failure);
  }
}
