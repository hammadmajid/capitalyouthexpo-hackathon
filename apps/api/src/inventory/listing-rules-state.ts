import { createHash } from 'node:crypto';
import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import { hostelRules } from '@hsm/db';
import {
  DomainError,
  listingRuleSequenceIsValid,
  decodeListingRuleCursor,
  encodeListingRuleCursor,
  privateListingRuleSchema,
  privateListingRulesPageSchema,
  type ListingRulesQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export type ListingRuleRow = typeof hostelRules.$inferSelect;
function ruleInstant(value: Date | null) {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new DomainError('INTERNAL', 500, 'Listing rule metadata is invalid');
  return value.toISOString();
}
export function projectListingRule(row: ListingRuleRow) {
  if (!Number.isInteger(row.revision) || row.revision < 1 || row.revision > 2147483647)
    throw new DomainError('INTERNAL', 500, 'Listing rule metadata is invalid');
  const value = {
    id: row.id,
    branchId: row.branchId,
    body: row.body,
    sortOrder: row.sortOrder,
    createdAt: ruleInstant(row.createdAt),
    updatedAt: ruleInstant(row.updatedAt),
    archivedAt: ruleInstant(row.archivedAt),
  };
  const version = createHash('sha256')
    .update(JSON.stringify({ ...value, revision: row.revision }))
    .digest('hex');
  const parsed = privateListingRuleSchema.safeParse({ ...value, version });
  if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Listing rule metadata is invalid');
  return parsed.data;
}
export async function readListingRuleRow(
  transaction: Transaction,
  branchId: string,
  ruleId: string,
) {
  const [row] = await transaction
    .select()
    .from(hostelRules)
    .where(and(eq(hostelRules.branchId, branchId), eq(hostelRules.id, ruleId)))
    .limit(1)
    .for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Listing rule unavailable');
  if (row.branchId !== branchId || row.id !== ruleId)
    throw new DomainError('INTERNAL', 500, 'Listing rule metadata is invalid');
  return row;
}
export async function readListingRulesPage(
  transaction: Transaction,
  branchId: string,
  input: ListingRulesQuery,
  canEdit: boolean,
) {
  const cursor = input.cursor ? decodeListingRuleCursor(input.cursor) : undefined;
  const rows = await transaction
    .select()
    .from(hostelRules)
    .where(
      and(
        eq(hostelRules.branchId, branchId),
        input.state === 'active'
          ? isNull(hostelRules.archivedAt)
          : isNotNull(hostelRules.archivedAt),
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
    .for('share');
  if (rows.length > input.limit + 1)
    throw new DomainError('INTERNAL', 500, 'Invalid listing rule page');
  const projected = rows.map(projectListingRule);
  if (
    !listingRuleSequenceIsValid(projected, cursor) ||
    projected.some(
      (row) =>
        row.branchId !== branchId ||
        (input.state === 'active' ? row.archivedAt !== null : row.archivedAt === null),
    )
  )
    throw new DomainError('INTERNAL', 500, 'Invalid listing rule page');
  const data = projected.slice(0, input.limit),
    last = data.at(-1);
  const parsed = privateListingRulesPageSchema.safeParse({
    branchId,
    state: input.state,
    canEdit,
    data,
    nextCursor:
      rows.length > input.limit && last ? encodeListingRuleCursor(last.sortOrder, last.id) : null,
  });
  if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Invalid listing rule page');
  return parsed.data;
}
