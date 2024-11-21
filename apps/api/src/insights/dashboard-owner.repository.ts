import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { branches, organizations } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
// OWN-003 / AUD-009: page the authorized population independently of display size.
export async function dashboardOwnedBranches(tx: Transaction, actor: Actor, only?: string) {
  const result: { id: string; name: string; verificationStatus: string }[] = [];
  const seen = new Set<string>();
  let cursor: { id: string; name: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({
        id: branches.id,
        name: branches.name,
        verificationStatus: branches.verificationStatus,
      })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(
        and(
          eq(organizations.ownerUserId, actor.userId),
          isNull(organizations.archivedAt),
          isNull(branches.archivedAt),
          only ? eq(branches.id, only) : undefined,
          cursor
            ? or(
                gt(branches.name, cursor.name),
                and(eq(branches.name, cursor.name), gt(branches.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(branches.name), asc(branches.id))
      .limit(100);
    for (const row of rows) {
      if (seen.has(row.id))
        throw new DomainError('INTERNAL', 500, 'Dashboard branch scope unavailable');
      seen.add(row.id);
      result.push(row);
    }
    if (rows.length < 100) {
      if (only && !result.length) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
      return result;
    }
    cursor = rows.at(-1);
  }
}
