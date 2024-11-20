import { and, eq } from 'drizzle-orm';
import type { BillingAgreementTerms, FeeBillingPolicy } from '@hsm/contracts';
import { v7 } from 'uuid';
import {
  residents,
  stays,
  billingPolicies,
  stayAgreements,
  residentCharges,
  residentInvoices,
  residentInvoiceCharges,
  residentPayments,
  residentReceipts,
  residentLedger,
  residentFundMovements,
  type Database,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export const financeTime = new Date('2028-02-01T06:00:00.000Z');
export async function financeScope(
  harness: ReturnType<typeof inventoryHarness>,
  feeSetup?: {
    fees?: BillingAgreementTerms['fees'];
    feeBilling?: FeeBillingPolicy;
    graceDays?: number;
    rentAmountPaisa?: number;
    proration?: BillingAgreementTerms['policy']['proration'];
  },
  period = { moveInDate: '2028-02-01', expectedLeaveDate: '2028-03-01' },
) {
  const scope = await harness.scope(),
    residentId = v7(),
    stayId = v7(),
    policyId = v7(),
    agreementId = v7();
  const rentAmountPaisa = feeSetup?.rentAmountPaisa ?? 1800001;
  const policy = {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: feeSetup?.proration ?? { kind: 'full_period' },
    graceDays: feeSetup?.graceDays ?? 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'catalog_only',
    ...(feeSetup?.feeBilling === undefined ? {} : { feeBilling: feeSetup.feeBilling }),
  };
  await harness.database().transaction(async (transaction) => {
    await transaction.insert(residents).values({
      id: residentId,
      branchId: scope.branchId,
      userId: scope.customerA,
      displayName: 'Finance fixture resident',
      createdByUserId: scope.ownerId,
    });
    // Financial-constraint fixture, not an admission or actual-occupancy acceptance claim.
    await transaction.insert(stays).values({
      id: stayId,
      branchId: scope.branchId,
      residentId,
      userId: scope.customerA,
      source: 'manual',
      state: 'check_in_ready',
      moveInDate: period.moveInDate,
      expectedLeaveDate: period.expectedLeaveDate,
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(billingPolicies).values({
      id: policyId,
      branchId: scope.branchId,
      policy,
      isCurrent: true,
      createdByUserId: scope.ownerId,
    });
    await transaction.insert(stayAgreements).values({
      id: agreementId,
      branchId: scope.branchId,
      stayId,
      version: 1,
      effectiveFrom: period.moveInDate,
      policyVersionId: policyId,
      rentAmountPaisa: BigInt(rentAmountPaisa),
      depositPaisa: 1000001n,
      termsSnapshot: {
        policyVersionId: policyId,
        currency: 'PKR',
        fees: feeSetup?.fees ?? [],
        catalog: [],
        rentAmountPaisa,
        depositPaisa: 1000001,
        policy,
      },
      reason: 'Finance fixture agreement',
      createdByUserId: scope.ownerId,
    });
  });
  return { ...scope, residentId, stayId, agreementId };
}
export type FinanceScope = Awaited<ReturnType<typeof financeScope>>;
const location = (scope: FinanceScope) => ({ branchId: scope.branchId, stayId: scope.stayId });
export async function postRent(
  transaction: Transaction,
  scope: FinanceScope,
  amount = 1800001n,
  key = 'rent:2028-02',
) {
  const id = v7();
  await transaction.insert(residentCharges).values({
    id,
    ...location(scope),
    agreementId: scope.agreementId,
    kind: 'rent',
    sourceKey: key,
    descriptionSnapshot: 'Agreed February rent',
    quantity: 1,
    amountPaisa: amount,
    periodStart: '2028-02-01',
    periodEnd: '2028-03-01',
    postedByUserId: scope.ownerId,
    postedAt: financeTime,
  });
  await transaction.insert(residentLedger).values({
    id: v7(),
    ...location(scope),
    chargeId: id,
    account: 'receivable',
    side: 'debit',
    amountPaisa: amount,
    postedAt: financeTime,
  });
  return id;
}
export async function issueInvoice(
  transaction: Transaction,
  scope: FinanceScope,
  chargeId: string,
  total = 1800001n,
) {
  const id = v7();
  await transaction.insert(residentInvoices).values({
    id,
    ...location(scope),
    number: 'INV-' + id,
    totalPaisa: total,
    dueDate: '2028-02-05',
    state: 'issued',
    issuedByUserId: scope.ownerId,
    issuedAt: financeTime,
  });
  await transaction
    .insert(residentInvoiceCharges)
    .values({ id: v7(), ...location(scope), invoiceId: id, chargeId });
  return id;
}
function fixtureNumber(amount: bigint) {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Fixture JSON amount out of range');
  return Number(amount);
}
export async function receivePayment(
  transaction: Transaction,
  scope: FinanceScope,
  input: {
    amount: bigint;
    allocations: { invoiceId: string; amount: bigint }[];
    deposit: bigint;
    advance: bigint;
    key?: string;
  },
) {
  const id = v7(),
    allocated = input.allocations.reduce((sum, row) => sum + row.amount, 0n);
  await transaction.insert(residentPayments).values({
    id,
    ...location(scope),
    sourceKey: input.key ?? id,
    amountPaisa: input.amount,
    method: 'cash',
    paidOn: '2028-02-01',
    approvedByUserId: scope.ownerId,
    approvedAt: financeTime,
    note: 'External hostel cash receipt fixture',
  });
  await transaction.insert(residentReceipts).values({
    id: v7(),
    ...location(scope),
    paymentId: id,
    number: 'RCP-' + id,
    issuedAt: financeTime,
    snapshot: {
      version: 1,
      currency: 'PKR',
      paymentId: id,
      ...location(scope),
      residentName: 'Finance fixture resident',
      hostelName: 'Inventory fixture',
      branchName: 'Inventory fixture',
      transactionReference: null,
      allocations: input.allocations.map((row) => ({
        invoiceId: row.invoiceId,
        invoiceNumber: 'INV-' + row.invoiceId,
        amountPaisa: fixtureNumber(row.amount),
      })),
      amountPaisa: fixtureNumber(input.amount),
      method: 'cash',
      paidOn: '2028-02-01',
      approvedAt: financeTime.toISOString(),
      distribution: {
        allocatedPaisa: fixtureNumber(allocated),
        depositPaisa: fixtureNumber(input.deposit),
        advanceCreditPaisa: fixtureNumber(input.advance),
      },
    },
  });
  const base = {
    ...location(scope),
    paymentId: id,
    fundingPaymentId: id,
    side: 'credit' as const,
    postedAt: financeTime,
  };
  const rows = [
    ...input.allocations.map((row) => ({
      id: v7(),
      ...base,
      invoiceId: row.invoiceId,
      account: 'receivable' as const,
      amountPaisa: row.amount,
    })),
    { id: v7(), ...base, account: 'deposit' as const, amountPaisa: input.deposit },
    { id: v7(), ...base, account: 'advance' as const, amountPaisa: input.advance },
  ].filter((row) => row.amountPaisa > 0n);
  if (rows.length) await transaction.insert(residentLedger).values(rows);
  return id;
}
export async function applyDeposit(
  transaction: Transaction,
  scope: FinanceScope,
  paymentId: string,
  invoiceId: string,
  amount: bigint,
) {
  await transaction
    .select({ id: residentPayments.id })
    .from(residentPayments)
    .where(
      and(
        eq(residentPayments.branchId, scope.branchId),
        eq(residentPayments.stayId, scope.stayId),
        eq(residentPayments.id, paymentId),
      ),
    )
    .for('update');
  const id = v7();
  await transaction.insert(residentFundMovements).values({
    id,
    ...location(scope),
    paymentId,
    invoiceId,
    kind: 'deposit_apply',
    sourceKey: id,
    amountPaisa: amount,
    reason: 'Explicit deposit application',
    postedByUserId: scope.ownerId,
    postedAt: financeTime,
  });
  const base = {
    ...location(scope),
    fundMovementId: id,
    fundingPaymentId: paymentId,
    amountPaisa: amount,
    postedAt: financeTime,
  };
  await transaction.insert(residentLedger).values([
    { id: v7(), ...base, account: 'deposit', side: 'debit' },
    { id: v7(), ...base, account: 'receivable', side: 'credit', invoiceId },
  ]);
}
