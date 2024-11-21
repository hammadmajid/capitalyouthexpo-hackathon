import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { branches, organizations } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
// RPT-001 / SEC-003 / AUD-010: a dashboard's bounded display is not the set of
// branches an Owner may report on. Keep every query bounded while completing
// the authorized name/id traversal, or checking the explicit requested subset.
export async function reportOwnedBranchIds(tx: Transaction, actor: Actor, requested?: string[]) {
  if (requested?.length === 0) return [];
  const ids: string[] = [],
    seen = new Set<string>();
  let cursor: { id: string; name: string } | undefined;
  for (;;) {
    const rows = await tx
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(
        and(
          eq(organizations.ownerUserId, actor.userId),
          isNull(organizations.archivedAt),
          isNull(branches.archivedAt),
          requested ? inArray(branches.id, requested) : undefined,
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
        throw new DomainError('INTERNAL', 500, 'Report branch scope unavailable');
      seen.add(row.id);
      ids.push(row.id);
    }
    if (rows.length < 100) return ids;
    cursor = rows.at(-1);
  }
}
