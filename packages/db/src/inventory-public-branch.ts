import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from './index.js';
import { branches, cities, brands, organizations } from './schema/index.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function readPublicInventoryBranch(
  database: Transaction,
  branchId: string,
  lockCity = false,
) {
  const query = database
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(
      and(
        eq(branches.id, branchId),
        eq(cities.isActive, true),
        eq(branches.verificationStatus, 'approved'),
        isNull(branches.listingHiddenAt),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .limit(1);
  const [branch] = await (lockCity ? query.for('share', { of: cities }) : query);
  return branch;
}
