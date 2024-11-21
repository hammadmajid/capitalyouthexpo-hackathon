import { eq, inArray, isNull, or } from 'drizzle-orm';
import { amenities, branches } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
// LIST-001 / ACC-002: catalog extensions can only be assigned inside their organization.
// Callers must first lock/authorize the branch; absent branch scope allows global codes only.
export function amenityScope(tx: Transaction, branchId?: string) {
  return branchId
    ? or(
        isNull(amenities.organizationId),
        inArray(
          amenities.organizationId,
          tx
            .select({ organizationId: branches.organizationId })
            .from(branches)
            .where(eq(branches.id, branchId)),
        ),
      )
    : isNull(amenities.organizationId);
}
