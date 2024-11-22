import { and, eq } from 'drizzle-orm';
import { residentCharges, residentInvoiceCharges } from '@hsm/db';
import {
  DomainError,
  residentInvoiceBalanceSchema,
  type ResidentInvoiceBalance,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { paymentSecurity } from './proof-security.js';
// Called only after live financial read authorization and the exact Stay lock.
// Security remains a refundable liability, never rent revenue or an invoice allocation.
export async function withInvoiceComponents(
  tx: Transaction,
  branchId: string,
  stayId: string,
  balance: ResidentInvoiceBalance,
  now: Date,
) {
  const lines = await tx
    .select({
      kind: residentCharges.kind,
      description: residentCharges.descriptionSnapshot,
      amount: residentCharges.amountPaisa,
    })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(
      and(
        eq(residentInvoiceCharges.branchId, branchId),
        eq(residentInvoiceCharges.stayId, stayId),
        eq(residentInvoiceCharges.invoiceId, balance.invoiceId),
      ),
    )
    .limit(101);
  if (
    !lines.length ||
    lines.length > 100 ||
    lines.reduce((sum, row) => sum + row.amount, 0n) !== BigInt(balance.totalPaisa)
  )
    throw new DomainError('INTERNAL', 500, 'Invoice classification unavailable');
  const security = await paymentSecurity(tx, branchId, stayId, now);
  const collectSecurity = balance.state !== 'voided' && lines.some((line) => line.kind === 'rent');
  return residentInvoiceBalanceSchema.parse({
    ...balance,
    lineItems: lines.map((line) => ({
      kind: line.kind,
      description: line.description,
      amountPaisa: Number(line.amount),
    })),
    securityDuePaisa: collectSecurity ? security.outstandingDepositPaisa : 0,
    securityPendingPaisa: collectSecurity ? security.pendingDepositPaisa : 0,
  });
}
