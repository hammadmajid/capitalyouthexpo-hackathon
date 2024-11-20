import { and, eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { residentLedger, residentChargeAdjustments, type Database } from '../src/index.js';
import { financeTime, type FinanceScope } from './resident-finance.fixture.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function accountBalance(
  database: Database,
  scope: FinanceScope,
  account: (typeof residentLedger.$inferSelect)['account'],
) {
  const [row] = await database
    .select({
      amount: sql<string>`coalesce(sum(case
    when ${residentLedger.side} = 'debit' then ${residentLedger.amountPaisa}
    else -${residentLedger.amountPaisa} end),0)::text`,
    })
    .from(residentLedger)
    .where(
      and(
        eq(residentLedger.branchId, scope.branchId),
        eq(residentLedger.stayId, scope.stayId),
        eq(residentLedger.account, account),
      ),
    );
  const balance = BigInt(row?.amount ?? '0');
  return account === 'receivable' ? balance : -balance;
}

export async function postCredit(
  transaction: Transaction,
  scope: FinanceScope,
  chargeId: string,
  amount: bigint,
) {
  const id = v7();
  await transaction.insert(residentChargeAdjustments).values({
    id,
    branchId: scope.branchId,
    stayId: scope.stayId,
    chargeId,
    kind: 'waiver',
    sourceKey: id,
    side: 'credit',
    amountPaisa: amount,
    reason: 'Explicit Owner waiver fixture',
    postedByUserId: scope.ownerId,
    postedAt: financeTime,
  });
  await transaction.insert(residentLedger).values({
    id: v7(),
    branchId: scope.branchId,
    stayId: scope.stayId,
    adjustmentId: id,
    account: 'receivable',
    side: 'credit',
    amountPaisa: amount,
    postedAt: financeTime,
  });
}
