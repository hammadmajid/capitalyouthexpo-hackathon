import { and, asc, eq, gt } from 'drizzle-orm';
import type { PostingTransaction } from './resident-posting-context.js';
import { residentFundMovements, residentPayments } from './schema/index.js';
import { readStaySettlement } from './stay-settlement.js';
// P9-FIX-04 / OUT-005: everything recorded after the statement was frozen, oldest first, with
// the live settlement. The original statement row is never touched.
export async function readPostCheckoutActivity(
  tx: PostingTransaction,
  input: { branchId: string; stayId: string; since: Date; today: string },
) {
  const scope = (table: typeof residentFundMovements | typeof residentPayments) =>
    and(eq(table.branchId, input.branchId), eq(table.stayId, input.stayId));
  const funds = await tx
    .select()
    .from(residentFundMovements)
    .where(and(scope(residentFundMovements), gt(residentFundMovements.postedAt, input.since)))
    .orderBy(asc(residentFundMovements.postedAt), asc(residentFundMovements.id))
    .limit(100);
  const payments = await tx
    .select()
    .from(residentPayments)
    .where(and(scope(residentPayments), gt(residentPayments.approvedAt, input.since)))
    .orderBy(asc(residentPayments.approvedAt), asc(residentPayments.id))
    .limit(100);
  const movements = [
    ...funds.map((row) => ({
      kind: row.kind,
      amountPaisa: Number(row.amountPaisa),
      recordedAt: row.postedAt.toISOString(),
      externalReference: row.externalReference,
    })),
    ...payments.map((row) => ({
      kind: 'payment' as const,
      amountPaisa: Number(row.amountPaisa),
      recordedAt: row.approvedAt.toISOString(),
      externalReference: null,
    })),
  ]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(0, 100);
  const current = await readStaySettlement(tx, {
    branchId: input.branchId,
    stayId: input.stayId,
    today: input.today,
  });
  return { movements, current };
}
