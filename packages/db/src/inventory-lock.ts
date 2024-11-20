import { and, eq } from 'drizzle-orm';
import type { Database } from './index.js';
import { branches, brands, organizations } from './schema/index.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Shared lock order for customer commands, management and expiry: organization -> hostel -> branch -> room.
export async function lockInventoryBranch(database: Transaction, branchId: string) {
  const [target] = await database
    .select({ organizationId: branches.organizationId, brandId: branches.brandId })
    .from(branches)
    .where(eq(branches.id, branchId));
  if (!target) throw new Error('Inventory branch unavailable');
  const [organization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, target.organizationId))
    .for('update');
  const [brand] = await database
    .select()
    .from(brands)
    .where(and(eq(brands.id, target.brandId), eq(brands.organizationId, target.organizationId)))
    .for('update');
  const [branch] = await database
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.id, branchId),
        eq(branches.organizationId, target.organizationId),
        eq(branches.brandId, target.brandId),
      ),
    )
    .for('update');
  if (!organization || !brand || !branch) throw new Error('Inventory hierarchy unavailable');
  return { organization, brand, branch };
}
