import { expect, it } from 'vitest';
import { fundMovementInputSchema, settlementNet, staySettlementSchema } from './stay-lifecycle.js';
const id = '10000000-0000-4000-8000-000000000001';
const zero = {
  receivedPaisa: 0,
  appliedToRentPaisa: 0,
  deductedPaisa: 0,
  refundedPaisa: 0,
  heldPaisa: 0,
};
it('OUT-005: settlement nets held funds against outstanding in integer paisa', () => {
  expect(settlementNet(1000, 400, 100)).toEqual({ netPayablePaisa: 500, netRefundablePaisa: 0 });
  expect(settlementNet(1000, 900, 300)).toEqual({ netPayablePaisa: 0, netRefundablePaisa: 200 });
  expect(settlementNet(0, 0, 0)).toEqual({ netPayablePaisa: 0, netRefundablePaisa: 0 });
  const base = {
    stayId: id,
    branchId: id,
    stayState: 'active',
    invoices: [],
    invoicesTruncated: false,
    outstandingPaisa: 0,
    deposit: zero,
    advance: zero,
    netPayablePaisa: 0,
    netRefundablePaisa: 0,
    fundSources: [],
    asOf: '2026-10-25',
  };
  expect(staySettlementSchema.parse(base).stayState).toBe('active');
  expect(
    staySettlementSchema.safeParse({ ...base, netPayablePaisa: 1, netRefundablePaisa: 1 }).success,
  ).toBe(false);
});
it('OUT-003/004: apply needs an invoice; settlement acts need a reason and positive paisa', () => {
  expect(
    fundMovementInputSchema.safeParse({
      paymentId: id,
      movement: { kind: 'deposit_apply', amountPaisa: 1, reason: 'r', invoiceId: id },
    }).success,
  ).toBe(true);
  for (const movement of [
    { kind: 'deposit_apply', amountPaisa: 1, reason: 'r' },
    { kind: 'deposit_deduct', amountPaisa: 0, reason: 'r' },
    { kind: 'deposit_deduct', amountPaisa: 1, reason: '' },
    { kind: 'cash_out', amountPaisa: 1, reason: 'r' },
  ])
    expect(fundMovementInputSchema.safeParse({ paymentId: id, movement }).success).toBe(false);
});
