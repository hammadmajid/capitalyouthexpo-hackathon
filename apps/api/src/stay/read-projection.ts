import { DomainError, staySummarySchema, stayDetailSchema } from '@hsm/contracts';
import type { residents, stays, stayAssignments } from '@hsm/db';
export type StayReadRow = {
  stay: typeof stays.$inferSelect;
  resident: Pick<
    typeof residents.$inferSelect,
    'id' | 'branchId' | 'displayName' | 'phone' | 'email'
  >;
  assignment: typeof stayAssignments.$inferSelect | null;
};
function invalid(): never {
  throw new DomainError('INTERNAL', 500, 'Stay data unavailable');
}
export function projectStay(row: StayReadRow) {
  const { stay, resident, assignment } = row;
  if (
    resident.id !== stay.residentId ||
    resident.branchId !== stay.branchId ||
    (assignment !== null &&
      (assignment.stayId !== stay.id ||
        assignment.branchId !== stay.branchId ||
        assignment.endedAt !== null))
  )
    return invalid();
  try {
    return staySummarySchema.parse({
      id: stay.id,
      branchId: stay.branchId,
      residentId: stay.residentId,
      displayName: resident.displayName,
      source: stay.source,
      state: stay.state,
      version: stay.version,
      moveInDate: stay.moveInDate,
      expectedLeaveDate: stay.expectedLeaveDate,
      checkedInAt: stay.checkedInAt?.toISOString() ?? null,
      closedAt: stay.closedAt?.toISOString() ?? null,
      currentAssignment:
        assignment === null
          ? null
          : {
              id: assignment.id,
              roomTypeId: assignment.roomTypeId,
              roomId: assignment.roomId,
              bedId: assignment.seatId,
              startedAt: assignment.startedAt.toISOString(),
            },
    });
  } catch {
    return invalid();
  }
}
export function projectStayDetail(row: StayReadRow) {
  const result = stayDetailSchema.safeParse({
    ...projectStay(row),
    bookingId: row.stay.bookingId,
    contact: { phone: row.resident.phone, email: row.resident.email },
  });
  return result.success ? result.data : invalid();
}
