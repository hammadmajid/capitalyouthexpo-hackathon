import { and, asc, eq, exists, gt, inArray, isNull, or } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import type { Database } from './index.js';
import {
  announcements,
  branches,
  customerProfiles,
  managerAssignments,
  organizations,
  users,
} from './schema/index.js';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export const ANNOUNCEMENT_RECIPIENT_BATCH_SIZE = 500;
// ADM-010 / AUD-008: membership is a predicate on distinct users, never a capped
// list of assignments/branches followed by deduplication. Preserve audience rules.
function audiencePredicate(row: typeof announcements.$inferSelect) {
  const query = new QueryBuilder();
  if (row.audience === 'customers')
    return and(
      eq(users.accountStatus, 'active'),
      exists(
        query
          .select({ id: customerProfiles.userId })
          .from(customerProfiles)
          .where(eq(customerProfiles.userId, users.id)),
      ),
    );
  const branch =
    row.audience === 'selected_branches'
      ? inArray(branches.id, row.branchIds)
      : row.audience === 'city' && row.cityId
        ? eq(branches.cityId, row.cityId)
        : undefined;
  const manager = exists(
    query
      .select({ id: managerAssignments.userId })
      .from(managerAssignments)
      .innerJoin(branches, eq(branches.id, managerAssignments.branchId))
      .where(
        and(
          eq(managerAssignments.userId, users.id),
          eq(managerAssignments.status, 'active'),
          isNull(branches.archivedAt),
          branch,
        ),
      ),
  );
  if (row.audience === 'all_managers') return manager;
  const owner = exists(
    query
      .select({ id: organizations.ownerUserId })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(and(eq(organizations.ownerUserId, users.id), isNull(branches.archivedAt), branch)),
  );
  return or(manager, owner);
}
export async function* announcementRecipientPages(tx: Tx, row: typeof announcements.$inferSelect) {
  const predicate = audiencePredicate(row);
  let cursor: string | undefined;
  for (;;) {
    const page = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(predicate, cursor ? gt(users.id, cursor) : undefined))
      .orderBy(asc(users.id))
      .limit(ANNOUNCEMENT_RECIPIENT_BATCH_SIZE);
    if (page.length) yield page.map((user) => user.id);
    if (page.length < ANNOUNCEMENT_RECIPIENT_BATCH_SIZE) return;
    cursor = page.at(-1)?.id;
  }
}
