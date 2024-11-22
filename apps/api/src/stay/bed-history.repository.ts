import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { residents, seats, stayAssignments, stays, type Database } from '@hsm/db';
import { DomainError, type BedHistoryQuery } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
// BED-002 / RES-005: permanent assignments, including ended stays and archived beds.
export async function readBedHistory(
  database: Database,
  actor: Actor,
  branchId: string,
  bedId: string,
  query: BedHistoryQuery,
  clock: () => Date,
) {
  return database.transaction(async (tx) => {
    await lockActor(tx, actor, clock);
    await lockInventoryScope(tx, actor, branchId, 'stay_manage');
    await lockActor(tx, actor, clock);
    const [bed] = await tx
      .select({ roomId: seats.roomId })
      .from(seats)
      .where(and(eq(seats.id, bedId), eq(seats.branchId, branchId)));
    if (!bed) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
    const [beforeAt, beforeId] = query.cursor?.split('|') ?? [];
    const rows = await tx
      .select({
        assignmentId: stayAssignments.id,
        stayId: stays.id,
        residentName: residents.displayName,
        startedAt: stayAssignments.startedAt,
        endedAt: stayAssignments.endedAt,
        seatId: stayAssignments.seatId,
      })
      .from(stayAssignments)
      .innerJoin(stays, and(eq(stays.id, stayAssignments.stayId), eq(stays.branchId, branchId)))
      .innerJoin(
        residents,
        and(eq(residents.id, stays.residentId), eq(residents.branchId, branchId)),
      )
      .where(
        and(
          eq(stayAssignments.branchId, branchId),
          eq(stayAssignments.roomId, bed.roomId),
          or(eq(stayAssignments.seatId, bedId), isNull(stayAssignments.seatId)),
          beforeAt && beforeId
            ? or(
                lt(stayAssignments.startedAt, new Date(beforeAt)),
                and(
                  eq(stayAssignments.startedAt, new Date(beforeAt)),
                  lt(stayAssignments.id, beforeId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(stayAssignments.startedAt), desc(stayAssignments.id))
      .limit(query.limit + 1);
    const data = rows.slice(0, query.limit).map((row) => ({
      assignmentId: row.assignmentId,
      stayId: row.stayId,
      residentName: row.residentName,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      wholeRoom: row.seatId === null,
    }));
    const last = data.at(-1);
    return {
      branchId,
      bedId,
      data,
      nextCursor:
        rows.length > query.limit && last ? last.startedAt + '|' + last.assignmentId : null,
    };
  });
}
