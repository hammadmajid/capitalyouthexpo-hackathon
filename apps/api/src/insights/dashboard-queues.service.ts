import { and, asc, eq, gt } from 'drizzle-orm';
import { stays, type Database } from '@hsm/db';
import {
  dashboardQueueKindSchema,
  dashboardQueuePageSchema,
  managementPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockStaffScope } from '../services/scope.js';
import { karachiToday } from '../services/dates.js';
import { ComplaintRepository } from '../services/complaints.repository.js';
import { stayReadSelect } from '../stay/read-query.js';
import { projectStay } from '../stay/read-projection.js';
import { upcomingCheckouts } from './dashboard-queue-predicates.js';
import { overdueQueue } from './dashboard-overdue.repository.js';
export async function dashboardQueue(
  database: Database,
  actor: Actor,
  branch: unknown,
  kind: unknown,
  query: unknown,
  clock: () => Date,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    queue = dashboardQueueKindSchema.parse(kind),
    page = managementPageSchema.parse(query);
  return database.transaction(async (tx) => {
    await lockStaffScope(
      tx,
      actor,
      branchId,
      [queue === 'overdue' ? 'finance_view' : 'stay_manage'],
      clock,
    );
    const asOf = karachiToday(clock());
    if (queue === 'overdue')
      return dashboardQueuePageSchema.parse({
        queue,
        branchId,
        asOf,
        ...(await overdueQueue(tx, branchId, asOf, page)),
      });
    if (queue === 'complaints')
      return dashboardQueuePageSchema.parse({
        queue,
        branchId,
        asOf,
        ...(await new ComplaintRepository().page(
          tx,
          { branchId, unresolved: true },
          page.cursor,
          page.limit,
        )),
      });
    const rows = await stayReadSelect(tx)
      .where(
        and(
          eq(stays.branchId, branchId),
          upcomingCheckouts(asOf),
          page.cursor ? gt(stays.id, page.cursor) : undefined,
        ),
      )
      .orderBy(asc(stays.id))
      .limit(page.limit + 1);
    return dashboardQueuePageSchema.parse({
      queue,
      branchId,
      asOf,
      data: rows.slice(0, page.limit).map(projectStay),
      nextCursor: rows.length > page.limit ? (rows[page.limit - 1]?.stay.id ?? null) : null,
    });
  });
}
