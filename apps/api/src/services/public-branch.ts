import { and, eq } from 'drizzle-orm';
import { branches, brands, cities, organizations } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { publicListingCondition } from '../marketplace/query.js';
// BR-05: public service reads exist only for a currently published, verified listing.
export async function requirePublicBranch(tx: Pick<Transaction, 'select'>, branchId: string) {
  const [row] = await tx
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .where(and(eq(branches.id, branchId), publicListingCondition()))
    .limit(1);
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
}
