import { residentInvoices, branches, brands } from '@hsm/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  residents,
  stays,
  billingPolicies,
  stayAgreements,
  postAgreedRentPeriod,
  hostelAuditLog,
  residentPayments,
  residentReceipts,
  residentLedger,
} from '@hsm/db';
import { billingAgreementTermsSchema, residentReceiptSnapshotSchema } from '@hsm/contracts';
import type { phaseTwoFixture } from './phase-two-fixture.js';
type Fixture = Pick<
  Awaited<ReturnType<typeof phaseTwoFixture>>,
  'connection' | 'inventory' | 'now'
> & { customerA: string; organizationId: string; ownerId: string };
export async function invoiceFixture(
  f: Fixture,
  userId: string | null = f.customerA,
  expectedLeaveDate = '2026-11-01',
) {
  const branch = await f.inventory(),
    residentId = randomUUID(),
    stayId = randomUUID(),
    policyId = randomUUID(),
    agreementId = randomUUID();
  const terms = invoiceTerms(policyId);
  const posting = await f.connection.db.transaction(async (tx) => {
    await writeFinancialFixture(tx, f, {
      branch,
      residentId,
      stayId,
      policyId,
      agreementId,
      terms,
      userId,
      expectedLeaveDate,
    });
    const result = await postAgreedRentPeriod(
      tx,
      { branchId: branch.branchId, stayId, agreementId, actorUserId: f.ownerId, periodIndex: 0 },
      f.now,
    );
    await tx.insert(hostelAuditLog).values({
      organizationId: f.organizationId,
      branchId: branch.branchId,
      actorUserId: f.ownerId,
      actorRole: 'owner',
      action: 'rent.posted',
      targetType: 'stay',
      targetId: stayId,
      after: result,
    });
    return result;
  });
  if (!posting.invoiceId) throw new Error('Invoice fixture missing');
  return { ...branch, stayId, invoiceId: posting.invoiceId };
}
// Actual approved-payment/receipt dataset for read tests; not payment-route acceptance.
export async function approveInvoiceReceipt(
  f: Fixture,
  item: Awaited<ReturnType<typeof invoiceFixture>>,
) {
  const paymentId = randomUUID();
  const facts = await invoiceFacts(f, item.invoiceId);
  const snapshot = residentReceiptSnapshotSchema.parse({
    version: 1,
    currency: 'PKR',
    paymentId,
    branchId: item.branchId,
    stayId: item.stayId,
    residentName: 'Private invoice resident',
    hostelName: facts.hostelName.trim(),
    branchName: facts.branchName.trim(),
    amountPaisa: 1800001,
    method: 'cash',
    transactionReference: null,
    paidOn: '2026-10-04',
    approvedAt: f.now.toISOString(),
    allocations: [
      {
        invoiceId: item.invoiceId,
        invoiceNumber: facts.number,
        amountPaisa: 1800001,
      },
    ],
    distribution: { allocatedPaisa: 1800001, depositPaisa: 0, advanceCreditPaisa: 0 },
  });
  await f.connection.db.transaction((tx) => persistReceipt(tx, f, item, paymentId, snapshot));
}
async function invoiceFacts(f: Fixture, id: string) {
  const [row] = await f.connection.db
    .select({ number: residentInvoices.number, branchName: branches.name, hostelName: brands.name })
    .from(residentInvoices)
    .innerJoin(branches, eq(branches.id, residentInvoices.branchId))
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .where(eq(residentInvoices.id, id));
  if (!row) throw new Error('Invoice missing');
  return row;
}

function invoiceTerms(policyId: string) {
  const terms = billingAgreementTermsSchema.parse({
    policyVersionId: policyId,
    currency: 'PKR',
    fees: [],
    catalog: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 1000001,
    policy: {
      cycle: { kind: 'calendar_month', dueDay: 5 },
      proration: { kind: 'full_period' },
      graceDays: 2,
      lateCharge: { kind: 'disabled' },
      noticeDays: 15,
      earlyCheckout: { kind: 'manual' },
      allowOpenEnded: false,
      customCharges: 'disabled',
    },
  });
  return terms;
}

type Setup = {
  branch: Awaited<ReturnType<Fixture['inventory']>>;
  residentId: string;
  stayId: string;
  policyId: string;
  agreementId: string;
  terms: ReturnType<typeof invoiceTerms>;
  userId: string | null;
  expectedLeaveDate: string;
};
type Transaction = Parameters<Parameters<Fixture['connection']['db']['transaction']>[0]>[0];
async function writeFinancialFixture(
  tx: Transaction,
  f: Fixture,
  { branch, residentId, stayId, policyId, agreementId, terms, userId, expectedLeaveDate }: Setup,
) {
  await tx.insert(residents).values({
    id: residentId,
    branchId: branch.branchId,
    userId,
    displayName: 'Private invoice resident',
    createdByUserId: f.ownerId,
  });
  await tx.insert(stays).values({
    id: stayId,
    branchId: branch.branchId,
    residentId,
    userId,
    source: 'manual',
    state: 'check_in_ready',
    moveInDate: '2026-10-01',
    expectedLeaveDate,
    createdByUserId: f.ownerId,
  });
  await tx.insert(billingPolicies).values({
    id: policyId,
    branchId: branch.branchId,
    policy: terms.policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  await tx.insert(stayAgreements).values({
    id: agreementId,
    branchId: branch.branchId,
    stayId,
    version: 1,
    effectiveFrom: '2026-10-01',
    policyVersionId: policyId,
    rentAmountPaisa: 1800001n,
    depositPaisa: 1000001n,
    termsSnapshot: terms,
    reason: 'Actual financial read fixture',
    createdByUserId: f.ownerId,
  });
}

async function persistReceipt(
  tx: Transaction,
  f: Fixture,
  item: Awaited<ReturnType<typeof invoiceFixture>>,
  paymentId: string,
  snapshot: ReturnType<typeof residentReceiptSnapshotSchema.parse>,
) {
  await tx.insert(residentPayments).values({
    id: paymentId,
    branchId: item.branchId,
    stayId: item.stayId,
    sourceKey: 'fixture:' + paymentId,
    amountPaisa: 1800001n,
    method: 'cash',
    paidOn: '2026-10-04',
    approvedByUserId: f.ownerId,
    approvedAt: f.now,
    note: 'Approved external receipt read fixture',
  });
  await tx.insert(residentReceipts).values({
    branchId: item.branchId,
    stayId: item.stayId,
    paymentId,
    number: 'R-' + paymentId,
    snapshot,
    issuedAt: f.now,
  });
  await tx.insert(residentLedger).values({
    branchId: item.branchId,
    stayId: item.stayId,
    account: 'receivable',
    side: 'credit',
    amountPaisa: 1800001n,
    invoiceId: item.invoiceId,
    paymentId,
    fundingPaymentId: paymentId,
    postedAt: f.now,
  });
}
