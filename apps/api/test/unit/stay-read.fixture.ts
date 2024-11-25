import { randomUUID } from 'node:crypto';
import type { StayReadRow } from '../../src/stay/read-projection.js';
export const stayReadActor = { userId: randomUUID(), sessionId: randomUUID() };
export const stayReadIds = {
  branch: randomUUID(),
  resident: randomUUID(),
  stay: '10000000-0000-4000-8000-000000000001',
  next: '10000000-0000-4000-8000-000000000002',
  room: randomUUID(),
  type: randomUUID(),
  bed: randomUUID(),
};
export const stayReadNow = new Date('2028-02-01T06:00:00.000Z');
export function stayReadRow(): StayReadRow {
  return {
    stay: {
      id: stayReadIds.stay,
      branchId: stayReadIds.branch,
      residentId: stayReadIds.resident,
      userId: stayReadActor.userId,
      bookingId: null,
      source: 'manual',
      state: 'active',
      version: 1,
      moveInDate: '2028-02-01',
      expectedLeaveDate: null,
      checkedInAt: stayReadNow,
      closedAt: null,
      createdByUserId: randomUUID(),
      createdAt: stayReadNow,
      updatedAt: stayReadNow,
    },
    resident: {
      id: stayReadIds.resident,
      branchId: stayReadIds.branch,
      displayName: 'Private resident',
      phone: '+923001234567',
      email: 'private@example.com',
    },
    assignment: {
      id: randomUUID(),
      branchId: stayReadIds.branch,
      stayId: stayReadIds.stay,
      roomTypeId: stayReadIds.type,
      roomId: stayReadIds.room,
      seatId: stayReadIds.bed,
      seatOrdinal: 1,
      startedAt: stayReadNow,
      endedAt: null,
      reason: 'Private historical reason',
      createdByUserId: randomUUID(),
      createdAt: stayReadNow,
    },
  };
}
