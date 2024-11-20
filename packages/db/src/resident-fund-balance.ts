import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  DomainError,
  stayIdentifierSchema,
  depositBalance,
  money,
  moneyToJson,
} from '@hsm/contracts';
import { stays } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { residentFundTotals } from './resident-fund-totals.js';
const scopeSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    paymentId: stayIdentifierSchema.optional(),
  })
  .strict();
const integer = z.string().regex(/^(0|[1-9]\d{0,15})$/);
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Resident funds unavailable');
}
function amount(value: unknown) {
  const parsed = integer.safeParse(value);
  if (!parsed.success) unavailable();
  const result = BigInt(parsed.data);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) unavailable();
  return moneyToJson(money(result));
}
async function lockStay(tx: PostingTransaction, scope: z.infer<typeof scopeSchema>) {
  const [stay] = await tx
    .select({ id: stays.id, branchId: stays.branchId })
    .from(stays)
    .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
    .for('share');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== scope.stayId || stay.branchId !== scope.branchId) unavailable();
}
// Internal read: caller supplies live exact Stay/branch authority. This does not
// decide the agreement's required deposit or perform an application/refund/transfer.
export async function readResidentFundBalance(tx: PostingTransaction, value: unknown) {
  const scope = scopeSchema.parse(value);
  await lockStay(tx, scope);
  const rows = await residentFundTotals(tx, scope),
    row = rows[0];
  if (rows.length !== 1 || !row) unavailable();
  return projectFundBalance(row);
}
// Shared projection for single-Stay commands and bounded reporting batches.
export function projectFundBalance(row: Awaited<ReturnType<typeof residentFundTotals>>[number]) {
  const deposit = {
    receivedPaisa: amount(row.depositReceived),
    appliedToRentPaisa: amount(row.depositApplied),
    deductedPaisa: amount(row.depositDeducted),
    refundedPaisa: amount(row.depositRefunded),
  };
  const advance = {
    receivedPaisa: amount(row.advanceReceived),
    appliedToRentPaisa: amount(row.advanceApplied),
    deductedPaisa: 0,
    refundedPaisa: amount(row.advanceRefunded),
  };
  try {
    const depositResult = depositBalance(deposit),
      advanceResult = depositBalance(advance);
    return {
      deposit: depositResult,
      advance: {
        receivedPaisa: advanceResult.receivedPaisa,
        appliedToRentPaisa: advanceResult.appliedToRentPaisa,
        refundedPaisa: advanceResult.refundedPaisa,
        availablePaisa: advanceResult.heldPaisa,
      },
    };
  } catch {
    unavailable();
  }
}
