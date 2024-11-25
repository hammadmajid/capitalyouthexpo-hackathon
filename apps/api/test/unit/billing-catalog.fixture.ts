import { randomUUID } from 'node:crypto';
import type { residentChargeCatalog } from '@hsm/db';
export const catalogIds = {
  branch: randomUUID(),
  organization: randomUUID(),
  brand: randomUUID(),
  owner: randomUUID(),
  session: randomUUID(),
  entry: '10000000-0000-4000-8000-000000000001',
  next: '10000000-0000-4000-8000-000000000002',
};
export const catalogActor = { userId: catalogIds.owner, sessionId: catalogIds.session };
export const catalogNow = new Date('2028-02-01T06:00:00.000Z');
export const catalogInput = {
  code: 'electricity_kwh_v1',
  name: 'Electricity',
  unitLabel: 'kWh',
  unitAmountPaisa: 3500,
};
export const catalogScopeFixture = {
  organizationId: catalogIds.organization,
  brandId: catalogIds.brand,
  ownerId: catalogIds.owner,
  actorRole: 'owner',
};
export function catalogRow(patch: Partial<typeof residentChargeCatalog.$inferSelect> = {}) {
  return {
    id: catalogIds.entry,
    branchId: catalogIds.branch,
    ...catalogInput,
    unitAmountPaisa: 3500n,
    createdByUserId: catalogIds.owner,
    createdAt: catalogNow,
    archivedAt: null,
    ...patch,
  };
}
export const catalogEntry = {
  id: catalogIds.entry,
  branchId: catalogIds.branch,
  ...catalogInput,
  createdAt: catalogNow.toISOString(),
  archivedAt: null,
};
export const catalogPage = {
  branchId: catalogIds.branch,
  canEdit: true,
  includeArchived: false,
  data: [catalogEntry],
  nextCursor: null,
};
