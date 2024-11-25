import type { roomTypes, rooms, seats } from '@hsm/db';
export const pageIds = {
  first: '019a1234-1234-7123-8123-123456789abc',
  second: '019a1234-1234-7123-8123-123456789abd',
  third: '019a1234-1234-7123-8123-123456789abe',
  branch: '019a1234-1234-7123-8123-123456789abf',
};
export const pageNow = new Date('2026-10-17T00:00:00Z');
export const pageAccess = {
  branchId: pageIds.branch,
  permissions: [],
  canConfigureManagers: false,
};
export function pageType(
  input: Partial<typeof roomTypes.$inferSelect> = {},
): typeof roomTypes.$inferSelect {
  return {
    id: pageIds.first,
    branchId: pageIds.branch,
    name: 'Shared',
    capacity: 2,
    setupManaged: false,
    inventoryMode: 'both',
    bedMonthlyRentPaisa: 1800001n,
    roomMonthlyRentPaisa: 3200000n,
    depositPaisa: 0n,
    createdAt: pageNow,
    updatedAt: pageNow,
    archivedAt: null,
    ...input,
  };
}
export function pageRoom(
  input: Partial<typeof rooms.$inferSelect> = {},
): typeof rooms.$inferSelect {
  return {
    id: pageIds.first,
    branchId: pageIds.branch,
    roomTypeId: pageIds.third,
    floorId: null,
    locationVersion: 1,
    amenitiesCustomized: false,
    label: '203',
    status: 'maintenance',
    createdAt: pageNow,
    updatedAt: pageNow,
    archivedAt: null,
    ...input,
  };
}
export function pageSeat(
  input: Partial<typeof seats.$inferSelect> = {},
): typeof seats.$inferSelect {
  return {
    id: pageIds.first,
    branchId: pageIds.branch,
    roomId: pageIds.third,
    label: 'A',
    ordinal: 3,
    status: 'inactive',
    createdAt: pageNow,
    updatedAt: pageNow,
    archivedAt: null,
    ...input,
  };
}
