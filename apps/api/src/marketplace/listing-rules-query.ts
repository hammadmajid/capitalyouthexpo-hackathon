import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { branches, brands, cities, hostelRules, organizations } from '@hsm/db';
import { decodeListingRuleCursor, type PublicListingRulesQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { publicListingCondition } from './query.js';
type Reader = Pick<Transaction, 'select'>;
export function publicListingRulesQuery(
  database: Reader,
  branchId: string,
  input: PublicListingRulesQuery,
) {
  const cursor = input.cursor ? decodeListingRuleCursor(input.cursor) : undefined;
  const rules = database
    .select({
      branchId: hostelRules.branchId,
      id: hostelRules.id,
      body: hostelRules.body,
      sortOrder: hostelRules.sortOrder,
    })
    .from(hostelRules)
    .where(
      and(
        eq(hostelRules.branchId, branchId),
        isNull(hostelRules.archivedAt),
        cursor
          ? or(
              gt(hostelRules.sortOrder, cursor.sortOrder),
              and(eq(hostelRules.sortOrder, cursor.sortOrder), gt(hostelRules.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(hostelRules.sortOrder, hostelRules.id)
    .limit(input.limit + 1)
    .as('public_hostel_rules');
  return database
    .select({ branchId: branches.id, id: rules.id, body: rules.body, sortOrder: rules.sortOrder })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .leftJoin(rules, eq(rules.branchId, branches.id))
    .where(and(eq(branches.id, branchId), publicListingCondition()))
    .orderBy(rules.sortOrder, rules.id)
    .limit(input.limit + 1);
}
export async function readPublicListingRulesRows(
  database: Transaction,
  branchId: string,
  input: PublicListingRulesQuery,
) {
  return await publicListingRulesQuery(database, branchId, input);
}
