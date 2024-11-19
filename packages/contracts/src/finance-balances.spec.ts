import { expect, it } from 'vitest';
import {
  depositBalance,
  depositTotalsSchema,
  invoiceBalance,
  invoiceBalanceInputSchema,
  invoiceFinancialStateSchema,
  paymentDistributionSchema,
} from './finance-balances.js';
import { residentLedgerPostingSchema } from './finance-ledger.js';
const totals = {
  totalPaisa: 1800001,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
};
const input = { totals, dueDate: '2028-02-05', today: '2028-02-05', graceDays: 0, voided: false };

it.each([
  [0, '2028-02-05', 'issued', 1800001],
  [1000000, '2028-02-05', 'partially_paid', 800001],
  [1800001, '2028-02-05', 'paid', 0],
  [0, '2028-02-06', 'overdue', 1800001],
  [1000000, '2028-02-06', 'overdue', 800001],
] as const)(
  'PAY-008 / FIN-001: receipt-backed allocation %i at %s gives %s',
  (allocatedPaisa, today, state, outstandingPaisa) => {
    expect(invoiceBalance({ ...input, today, totals: { ...totals, allocatedPaisa } })).toEqual({
      ...totals,
      allocatedPaisa,
      state,
      outstandingPaisa,
    });
  },
);
it('PAY-008: zero charges and a full credit adjustment are not falsely displayed Paid', () => {
  expect(invoiceBalance({ ...input, totals: { ...totals, totalPaisa: 0 } }).state).toBe(
    'no_charge',
  );
  expect(
    invoiceBalance({ ...input, totals: { ...totals, creditAdjustmentsPaisa: 1800001 } }).state,
  ).toBe('no_charge');
  expect(
    invoiceBalance({
      ...input,
      voided: true,
      totals: { ...totals, creditAdjustmentsPaisa: 1800001 },
    }).state,
  ).toBe('voided');
  expect(invoiceFinancialStateSchema.safeParse('proof_uploaded').success).toBe(false);
});
it('PAY-008 / FIN-001: partial approved payment plus explicit credit reconciles exactly', () => {
  expect(
    invoiceBalance({
      ...input,
      totals: { ...totals, creditAdjustmentsPaisa: 1, allocatedPaisa: 1800000 },
    }),
  ).toEqual({
    ...totals,
    creditAdjustmentsPaisa: 1,
    allocatedPaisa: 1800000,
    outstandingPaisa: 0,
    state: 'paid',
  });
});
it('ACC-003: money boundaries use bigint reconciliation, including sums beyond safe JSON range', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(
    invoiceBalance({
      ...input,
      totals: {
        totalPaisa: max,
        debitAdjustmentsPaisa: 0,
        creditAdjustmentsPaisa: 1,
        allocatedPaisa: max - 1,
      },
    }).outstandingPaisa,
  ).toBe(0);
  expect(
    invoiceBalanceInputSchema.safeParse({
      ...input,
      totals: {
        totalPaisa: max,
        debitAdjustmentsPaisa: 0,
        creditAdjustmentsPaisa: max,
        allocatedPaisa: 1,
      },
    }).success,
  ).toBe(false);
  expect(
    paymentDistributionSchema.safeParse({
      amountPaisa: max,
      allocatedPaisa: max,
      depositPaisa: 1,
      advanceCreditPaisa: 0,
    }).success,
  ).toBe(false);
});
it.each([
  { ...input, totals: { ...totals, allocatedPaisa: 1800002 } },
  { ...input, totals: { ...totals, creditAdjustmentsPaisa: 1800002 } },
  { ...input, totals: { ...totals, totalPaisa: 1.1 } },
  { ...input, totals: { ...totals, allocatedPaisa: -1 } },
  { ...input, voided: true, totals: { ...totals, allocatedPaisa: 1 } },
  { ...input, dueDate: '2028-02-30' },
  { ...input, today: '2028-13-01' },
  { ...input, paid: true },
])('PAY-008 / FIN-001: invalid or invented financial result is rejected %j', (value) => {
  expect(invoiceBalanceInputSchema.safeParse(value).success).toBe(false);
  expect(() => invoiceBalance(value)).toThrow();
});
it('PAY-008 / RENT-005: a partial, deposit and advance split retains every paisa', () => {
  const split = {
    amountPaisa: 5000001,
    allocatedPaisa: 1800001,
    depositPaisa: 1000000,
    advanceCreditPaisa: 2200000,
  };
  expect(paymentDistributionSchema.parse(split)).toEqual(split);
  expect(paymentDistributionSchema.safeParse({ ...split, advanceCreditPaisa: 0 }).success).toBe(
    false,
  );
  expect(paymentDistributionSchema.safeParse({ ...split, amountPaisa: 0 }).success).toBe(false);
});
it('OUT-004 / ACC-003: deposit is a separate liability, with all deductions, rent application and refunds retained', () => {
  const movement = {
    receivedPaisa: 1000001,
    deductedPaisa: 100000,
    appliedToRentPaisa: 300000,
    refundedPaisa: 200001,
  };
  expect(depositBalance(movement)).toEqual({ ...movement, heldPaisa: 400000 });
  expect(
    depositBalance({ receivedPaisa: 1, deductedPaisa: 0, appliedToRentPaisa: 0, refundedPaisa: 1 })
      .heldPaisa,
  ).toBe(0);
  expect(depositTotalsSchema.safeParse({ ...movement, refundedPaisa: 1000001 }).success).toBe(
    false,
  );
  expect(() => depositBalance({ ...movement, receivedPaisa: -1 })).toThrow();
});
const id = '019a1234-1234-7123-8123-123456789abc';
const posting = {
  id,
  branchId: id,
  stayId: id,
  amountPaisa: 1000001,
  postedAt: '2028-02-01T06:00:00.000Z',
};
it.each([
  { kind: 'charge', chargeId: id },
  { kind: 'approved_payment', paymentId: id, receiptId: id },
  { kind: 'adjustment', adjustmentId: id, direction: 'credit' },
  { kind: 'reversal', reversedEntryId: id, reason: 'Owner-approved correction' },
])(
  'FIN-001 / PAY-008: typed immutable ledger source %j serializes without money loss',
  (source) => {
    const value = residentLedgerPostingSchema.parse({ ...posting, ...source });
    expect(JSON.parse(JSON.stringify(value))).toEqual({ ...posting, ...source });
  },
);
it.each([
  { kind: 'approved_payment', paymentId: id },
  { kind: 'approved_payment', paymentId: id, receiptId: id, bankVerified: true },
  { kind: 'proof_uploaded', paymentId: id, receiptId: id },
  { kind: 'charge', chargeId: id, amountPaisa: 0 },
  { kind: 'reversal', reversedEntryId: id, reason: ' ' },
  { kind: 'adjustment', adjustmentId: id, direction: 'paid' },
])('PAY-008 / FIN-001: unsafe ledger posting %j is rejected', (source) => {
  expect(residentLedgerPostingSchema.safeParse({ ...posting, ...source }).success).toBe(false);
});

it.each([1.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'ACC-003: invalid paisa %s never throws out of safeParse during balance refinements',
  (amount) => {
    expect(
      invoiceBalanceInputSchema.safeParse({ ...input, totals: { ...totals, totalPaisa: amount } })
        .success,
    ).toBe(false);
    expect(
      paymentDistributionSchema.safeParse({
        amountPaisa: amount,
        allocatedPaisa: 0,
        depositPaisa: 0,
        advanceCreditPaisa: 0,
      }).success,
    ).toBe(false);
    expect(
      depositTotalsSchema.safeParse({
        receivedPaisa: amount,
        deductedPaisa: 0,
        appliedToRentPaisa: 0,
        refundedPaisa: 0,
      }).success,
    ).toBe(false);
  },
);

it('RENT-003 / ACC-003: explicit debit amendments never rewrite invoice face value or disappear from outstanding', () => {
  const result = invoiceBalance({
    ...input,
    totals: { ...totals, debitAdjustmentsPaisa: 200001, allocatedPaisa: 1000000 },
  });
  expect(result).toEqual({
    ...totals,
    debitAdjustmentsPaisa: 200001,
    allocatedPaisa: 1000000,
    outstandingPaisa: 1000002,
    state: 'partially_paid',
  });
  const max = Number.MAX_SAFE_INTEGER;
  expect(
    invoiceBalance({
      ...input,
      totals: {
        totalPaisa: max,
        debitAdjustmentsPaisa: 1,
        creditAdjustmentsPaisa: 1,
        allocatedPaisa: 0,
      },
    }).outstandingPaisa,
  ).toBe(max);
  expect(() =>
    invoiceBalance({
      ...input,
      totals: {
        totalPaisa: max,
        debitAdjustmentsPaisa: 1,
        creditAdjustmentsPaisa: 0,
        allocatedPaisa: 0,
      },
    }),
  ).toThrow(RangeError);
});

it('FIN-001 / RENT-003: a void flag cannot hide unpaid ledger debt or fractional void totals', () => {
  expect(invoiceBalanceInputSchema.safeParse({ ...input, voided: true }).success).toBe(false);
  expect(
    invoiceBalanceInputSchema.safeParse({
      ...input,
      voided: true,
      totals: { ...totals, totalPaisa: 1.1, creditAdjustmentsPaisa: 1.1 },
    }).success,
  ).toBe(false);
});
