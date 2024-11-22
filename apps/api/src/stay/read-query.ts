import { and, eq, gte, gt, ilike, isNull, lte, type SQL } from 'drizzle-orm';
import { residents, stays, stayAssignments } from '@hsm/db';
import type { CustomerStayQuery, StayReadQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export function stayReadSelect(database: Transaction) {
  return database
    .select({
      stay: stays,
      resident: {
        id: residents.id,
        branchId: residents.branchId,
        displayName: residents.displayName,
        phone: residents.phone,
        email: residents.email,
      },
      assignment: stayAssignments,
    })
    .from(stays)
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.stayId, stays.id),
        eq(stayAssignments.branchId, stays.branchId),
        isNull(stayAssignments.endedAt),
      ),
    );
}
export function stayReadFilter(query: CustomerStayQuery): SQL | undefined {
  return and(
    query.cursor === undefined ? undefined : gt(stays.id, query.cursor),
    query.state === undefined ? undefined : eq(stays.state, query.state),
  );
}
export function staffStayFilter(query: StayReadQuery) {
  const name = query.q?.replace(/[\\%_]/g, '\\$&');
  return and(
    stayReadFilter(query),
    name === undefined ? undefined : ilike(residents.displayName, '%' + name + '%'),
    query.roomId === undefined ? undefined : eq(stayAssignments.roomId, query.roomId),
    query.bedId === undefined ? undefined : eq(stayAssignments.seatId, query.bedId),
    query.moveInFrom === undefined ? undefined : gte(stays.moveInDate, query.moveInFrom),
    query.moveInTo === undefined ? undefined : lte(stays.moveInDate, query.moveInTo),
    query.expectedLeaveFrom === undefined
      ? undefined
      : gte(stays.expectedLeaveDate, query.expectedLeaveFrom),
    query.expectedLeaveTo === undefined
      ? undefined
      : lte(stays.expectedLeaveDate, query.expectedLeaveTo),
  );
}
