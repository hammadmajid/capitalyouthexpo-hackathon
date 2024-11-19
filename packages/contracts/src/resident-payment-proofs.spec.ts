import { expect, it } from 'vitest';
import {
  proofReviewInputSchema,
  residentProofInputSchema,
  residentProofSchema,
} from './resident-payment-proofs.js';
import { rentBoardState } from './rent-board.js';
const id = '10000000-0000-4000-8000-000000000001';
it('PAY-008: one proof explicitly carries security with bills, or security alone', () => {
  const input = {
    fileId: id,
    amountPaisa: 2800000,
    depositPaisa: 1000000,
    method: 'bank_transfer',
    paidOn: '2026-11-18',
  };
  expect(residentProofInputSchema.safeParse({ ...input, invoiceId: id }).success).toBe(true);
  expect(residentProofInputSchema.safeParse(input).success).toBe(true);
  expect(residentProofInputSchema.safeParse({ ...input, depositPaisa: 2800001 }).success).toBe(
    false,
  );
  expect(residentProofInputSchema.safeParse({ ...input, depositPaisa: 0 }).success).toBe(false);
});
const proof = {
  id,
  branchId: id,
  stayId: id,
  invoiceId: id,
  invoiceNumber: 'INV-1',
  amountPaisa: 1,
  method: 'bank_transfer',
  paidOn: '2026-10-24',
  reference: null,
  state: 'submitted',
  reviewReason: null,
  paymentId: null,
  receiptId: null,
  submittedAt: '2026-10-25T10:00:00.000Z',
  reviewedAt: null,
};
it('PAY-002: input requires positive paisa, a dated non-cash method and no unknown fields', () => {
  const input = {
    invoiceId: id,
    fileId: id,
    amountPaisa: 1,
    method: 'jazzcash',
    paidOn: '2026-10-24',
  };
  expect(residentProofInputSchema.parse(input)).toEqual(input);
  for (const bad of [
    { ...input, amountPaisa: 0 },
    { ...input, amountPaisa: 1.5 },
    { ...input, method: 'cash' },
    { ...input, paidOn: '2026-02-30' },
    { ...input, extra: true },
  ])
    expect(residentProofInputSchema.safeParse(bad).success).toBe(false);
});
it('ACC-004: approved exactly when a payment and receipt exist; rejection needs a reason', () => {
  expect(residentProofSchema.parse(proof).state).toBe('submitted');
  const reviewed = { reviewedAt: proof.submittedAt };
  expect(
    residentProofSchema.safeParse({
      ...proof,
      ...reviewed,
      state: 'approved',
      paymentId: id,
      receiptId: id,
    }).success,
  ).toBe(true);
  expect(
    residentProofSchema.safeParse({ ...proof, ...reviewed, state: 'approved', paymentId: id })
      .success,
  ).toBe(false);
  expect(residentProofSchema.safeParse({ ...proof, ...reviewed, state: 'rejected' }).success).toBe(
    false,
  );
  expect(residentProofSchema.safeParse({ ...proof, paymentId: id }).success).toBe(false);
  expect(proofReviewInputSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  expect(proofReviewInputSchema.parse({ decision: 'approve' })).toEqual({ decision: 'approve' });
});
it('Q5: a pending proof is action needed over a partial payment', () => {
  expect(rentBoardState(['partially_paid'], 2)).toBe('proof_pending');
  expect(rentBoardState(['partially_paid'])).toBe('partially_paid');
});
