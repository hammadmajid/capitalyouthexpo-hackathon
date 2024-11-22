import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  sql,
} from 'drizzle-orm';
import { residents, rooms, seats, stayAssignments, stays, type Database } from '@hsm/db';
import {
  CURRENT_STAY_STATES,
  DomainError,
  RESIDENT_PROFILE_STAY_LIMIT,
  residentDirectoryPageSchema,
  residentProfileSchema,
  type ResidentDirectoryQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { financialResidentRows } from './resident-financial-filter.js';
import { karachiToday } from '../services/dates.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
function anyStay(tx: Transaction, current: boolean) {
  return exists(
    tx
      .select({ id: stays.id })
      .from(stays)
      .where(
        and(
          eq(stays.residentId, residents.id),
          eq(stays.branchId, residents.branchId),
          current ? inArray(stays.state, [...CURRENT_STAY_STATES]) : undefined,
        ),
      ),
  );
}
function statusFilter(tx: Transaction, status: ResidentDirectoryQuery['status']) {
  if (status === 'current') return anyStay(tx, true);
  if (status === 'former') return and(not(anyStay(tx, true)), anyStay(tx, false));
  if (status === 'none') return not(anyStay(tx, false));
  return undefined;
}
async function keyset(tx: Transaction, branchId: string, query: ResidentDirectoryQuery) {
  if (query.cursor === undefined) return undefined;
  if (query.sort === 'newest') return lt(residents.id, query.cursor);
  const [anchor] = await tx
    .select({ name: residents.displayName })
    .from(residents)
    .where(and(eq(residents.branchId, branchId), eq(residents.id, query.cursor)));
  if (!anchor) throw new DomainError('VALIDATION_FAILED', 400, 'Invalid directory cursor');
  return sql`(${residents.displayName}, ${residents.id}) > (${anchor.name}, ${query.cursor})`;
}
// RES-004: current Stays with their open assignment labels for a bounded set of residents.
async function currentStays(tx: Transaction, branchId: string, residentIds: string[]) {
  if (residentIds.length === 0) return new Map<string, CurrentStay>();
  const rows = await tx
    .select({
      residentId: stays.residentId,
      id: stays.id,
      state: stays.state,
      moveInDate: stays.moveInDate,
      roomLabel: rooms.label,
      bedLabel: seats.label,
    })
    .from(stays)
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.stayId, stays.id),
        eq(stayAssignments.branchId, stays.branchId),
        isNull(stayAssignments.endedAt),
      ),
    )
    .leftJoin(rooms, eq(rooms.id, stayAssignments.roomId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId))
    .where(
      and(
        eq(stays.branchId, branchId),
        inArray(stays.residentId, residentIds),
        inArray(stays.state, [...CURRENT_STAY_STATES]),
      ),
    )
    .orderBy(desc(stays.id));
  const map = new Map<string, CurrentStay>();
  for (const { residentId, ...stay } of rows) if (!map.has(residentId)) map.set(residentId, stay);
  return map;
}
type CurrentStay = {
  id: string;
  state: (typeof stays.$inferSelect)['state'];
  moveInDate: string;
  roomLabel: string | null;
  bedLabel: string | null;
};
async function staffScope(tx: Transaction, actor: Actor, branchId: string, clock: () => Date) {
  await lockActor(tx, actor, clock);
  await lockInventoryScope(tx, actor, branchId, 'stay_manage');
  await lockActor(tx, actor, clock);
}
export class ResidentRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  directory(actor: Actor, branchId: string, query: ResidentDirectoryQuery) {
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branchId, this.clock);
      const name = query.q?.replace(/[\\%_]/g, '\\$&');
      if (query.billing) await lockInventoryScope(tx, actor, branchId, 'finance_view');
      const readRows = async (input: ResidentDirectoryQuery) =>
        tx
          .select({
            id: residents.id,
            displayName: residents.displayName,
            userId: residents.userId,
          })
          .from(residents)
          .where(
            and(
              eq(residents.branchId, branchId),
              isNull(residents.archivedAt),
              name === undefined ? undefined : ilike(residents.displayName, '%' + name + '%'),
              input.linked === undefined
                ? undefined
                : input.linked === 'true'
                  ? isNotNull(residents.userId)
                  : isNull(residents.userId),
              statusFilter(tx, input.status),
              await keyset(tx, branchId, input),
            ),
          )
          .orderBy(
            ...(input.sort === 'newest'
              ? [desc(residents.id)]
              : [asc(residents.displayName), asc(residents.id)]),
          )
          .limit(input.billing ? 100 : input.limit + 1);
      const rows = query.billing
        ? await financialResidentRows(tx, branchId, query, karachiToday(this.clock()), readRows)
        : await readRows(query);
      const page = rows.slice(0, query.limit);
      const current = await currentStays(
        tx,
        branchId,
        page.map((row) => row.id),
      );
      const former = await this.withStays(
        tx,
        branchId,
        page.map((row) => row.id),
      );
      return residentDirectoryPageSchema.parse({
        data: page.map((row) => {
          const stay = current.get(row.id) ?? null;
          return {
            id: row.id,
            displayName: row.displayName,
            linked: row.userId !== null,
            status: stay ? 'current' : former.has(row.id) ? 'former' : 'none',
            currentStay: stay,
          };
        }),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      });
    });
  }
  private async withStays(tx: Transaction, branchId: string, residentIds: string[]) {
    if (residentIds.length === 0) return new Set<string>();
    const rows = await tx
      .selectDistinct({ residentId: stays.residentId })
      .from(stays)
      .where(and(eq(stays.branchId, branchId), inArray(stays.residentId, residentIds)));
    return new Set(rows.map((row) => row.residentId));
  }
  profile(actor: Actor, branchId: string, residentId: string) {
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branchId, this.clock);
      const [resident] = await tx
        .select()
        .from(residents)
        .where(and(eq(residents.branchId, branchId), eq(residents.id, residentId)));
      if (!resident) throw new DomainError('NOT_FOUND', 404, 'Resident unavailable');
      const history = await tx
        .select({
          id: stays.id,
          source: stays.source,
          state: stays.state,
          moveInDate: stays.moveInDate,
          expectedLeaveDate: stays.expectedLeaveDate,
          closedAt: stays.closedAt,
        })
        .from(stays)
        .where(and(eq(stays.branchId, branchId), eq(stays.residentId, residentId)))
        .orderBy(desc(stays.id))
        .limit(RESIDENT_PROFILE_STAY_LIMIT + 1);
      const current = (await currentStays(tx, branchId, [residentId])).get(residentId) ?? null;
      const result = residentProfileSchema.safeParse({
        id: resident.id,
        branchId: resident.branchId,
        displayName: resident.displayName,
        contact: { phone: resident.phone, email: resident.email },
        cnicLast4: resident.cnicLast4 ?? null,
        linked: resident.userId !== null,
        archived: resident.archivedAt !== null,
        createdAt: resident.createdAt.toISOString(),
        status: current ? 'current' : history.length > 0 ? 'former' : 'none',
        currentStay: current,
        stays: history.slice(0, RESIDENT_PROFILE_STAY_LIMIT).map((stay) => ({
          ...stay,
          closedAt: stay.closedAt?.toISOString() ?? null,
        })),
        staysTruncated: history.length > RESIDENT_PROFILE_STAY_LIMIT,
      });
      if (!result.success) throw new DomainError('INTERNAL', 500, 'Resident data unavailable');
      return result.data;
    });
  }
}
