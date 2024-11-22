import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { readResidentFundBalance, residentPaymentProofs, stayAgreements, stays } from '@hsm/db';
import { DomainError, residentPaymentSummarySchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

export async function paymentSecurity(
  tx: Transaction,
  branchId: string,
  stayId: string,
  now: Date,
  excludeProofId?: string,
) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(now);
  const [stay] = await tx
    .select({ state: stays.state })
    .from(stays)
    .where(and(eq(stays.branchId, branchId), eq(stays.id, stayId)));
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const [agreement] = await tx
    .select({ amount: stayAgreements.depositPaisa })
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.branchId, branchId),
        eq(stayAgreements.stayId, stayId),
        lte(stayAgreements.effectiveFrom, today),
      ),
    )
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  const funds = await readResidentFundBalance(tx, { branchId, stayId });
  const [pending] = await tx
    .select({ amount: sql<string>`coalesce(sum(${residentPaymentProofs.depositPaisa}),0)::text` })
    .from(residentPaymentProofs)
    .where(
      and(
        eq(residentPaymentProofs.branchId, branchId),
        eq(residentPaymentProofs.stayId, stayId),
        eq(residentPaymentProofs.state, 'submitted'),
        excludeProofId ? ne(residentPaymentProofs.id, excludeProofId) : undefined,
      ),
    );
  const required = agreement?.amount ?? 0n;
  const remaining = required - BigInt(funds.deposit.receivedPaisa);
  const live = stay.state === 'active' || stay.state === 'notice_given';
  return residentPaymentSummarySchema.parse({
    stayId,
    branchId,
    requiredDepositPaisa: Number(required),
    receivedDepositPaisa: funds.deposit.receivedPaisa,
    outstandingDepositPaisa: live && remaining > 0n ? Number(remaining) : 0,
    pendingDepositPaisa: Number(pending?.amount ?? '0'),
  });
}
// Caller holds the exact Stay update lock. No contact inference or double security collection.
export async function requireProofSecurity(
  tx: Transaction,
  branchId: string,
  stayId: string,
  depositPaisa: number,
  now: Date,
  excludeProofId?: string,
) {
  if (!depositPaisa) return;
  const summary = await paymentSecurity(tx, branchId, stayId, now, excludeProofId);
  if (summary.pendingDepositPaisa > 0)
    throw new DomainError('CONFLICT', 409, 'Security deposit already has a proof awaiting review');
  if (depositPaisa > summary.outstandingDepositPaisa)
    throw new DomainError(
      'CONFLICT',
      409,
      'Security amount exceeds the remaining agreed deposit. Refresh payments.',
    );
}
