import { and, eq, isNull } from 'drizzle-orm';
import { branches, brands, organizations } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
export async function lockInvitationBranch(database: Transaction, actor: Actor, branchId: string) {
  const [branch] = await database
    .select({ organizationId: branches.organizationId })
    .from(branches)
    .innerJoin(
      brands,
      and(eq(brands.id, branches.brandId), eq(brands.organizationId, branches.organizationId)),
    )
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(
      and(
        eq(branches.id, branchId),
        eq(organizations.ownerUserId, actor.userId),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .for('update');
  if (!branch) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  return branch.organizationId;
}
