import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError, stayIdentifierSchema } from '@hsm/contracts';
import { stays } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { projectFundBalance } from './resident-fund-balance.js';
import { residentFundBatchTotals } from './resident-fund-totals.js';

const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayIds: z.array(stayIdentifierSchema).min(1).max(100),
  })
  .strict()
  .refine((value) => new Set(value.stayIds).size === value.stayIds.length);
// RENT-005 / AUD-006/012: same receipt/reversal rules and projection as the
// single-Stay reader. The caller supplies live branch authority.
export async function readResidentFundBalances(tx: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value);
  const locked = await tx
    .select({ id: stays.id, branchId: stays.branchId })
    .from(stays)
    .where(and(eq(stays.branchId, input.branchId), inArray(stays.id, input.stayIds)))
    .orderBy(asc(stays.id))
    .for('share');
  if (
    locked.length !== input.stayIds.length ||
    new Set(locked.map((row) => row.id)).size !== locked.length ||
    locked.some((row) => row.branchId !== input.branchId || !input.stayIds.includes(row.id))
  )
    throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const totals = await residentFundBatchTotals(tx, input);
  const byStay = new Map(totals.map((row) => [row.stayId, row]));
  if (byStay.size !== totals.length || totals.some((row) => !input.stayIds.includes(row.stayId)))
    throw new DomainError('INTERNAL', 500, 'Resident funds unavailable');
  return input.stayIds.map((stayId) => ({
    stayId,
    ...projectFundBalance(
      byStay.get(stayId) ?? {
        stayId,
        depositReceived: '0',
        depositApplied: '0',
        depositDeducted: '0',
        depositRefunded: '0',
        advanceReceived: '0',
        advanceApplied: '0',
        advanceRefunded: '0',
      },
    ),
  }));
}
