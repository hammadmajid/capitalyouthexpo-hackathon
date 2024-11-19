import { expect, it } from 'vitest';
import {
  bookingProofInputSchema,
  bookingProofReviewSchema,
  bookingUpfrontSchema,
  paymentInstructionInputSchema,
  upfrontAmountPaisa,
} from './booking-upfront.js';
const id = '019a1234-1234-7123-8123-123456789abc',
  at = '2026-10-25T10:00:00.000Z';
const proof = {
  id,
  state: 'submitted',
  amountPaisa: 2300000,
  method: 'bank_transfer',
  paidOn: '2026-10-25',
  reference: 'TRX-1',
  submittedAt: at,
  reviewedAt: null,
  reviewReason: null,
};
it('BKG-005: upfront amounts are only the captured deposit and/or one disclosed monthly rent', () => {
  const price = { monthlyRentPaisa: 1800000, depositPaisa: 500000 };
  expect(upfrontAmountPaisa('deposit', price)).toBe(500000n);
  expect(upfrontAmountPaisa('first_rent', price)).toBe(1800000n);
  expect(upfrontAmountPaisa('deposit_and_first_rent', price)).toBe(2300000n);
});
it('BKG-007/008 / ACC-004: upfront status must agree with approval and proof review state', () => {
  const base = { requirement: 'deposit_and_first_rent', amountPaisa: 2300000 };
  for (const value of [
    { ...base, status: 'awaiting_approval', approvedAt: null, proof: null },
    { ...base, status: 'awaiting_payment', approvedAt: at, proof: null },
    {
      ...base,
      status: 'awaiting_payment',
      approvedAt: at,
      proof: { ...proof, state: 'rejected', reviewedAt: at, reviewReason: 'Amount unclear' },
    },
    { ...base, status: 'verification_pending', approvedAt: at, proof },
    {
      ...base,
      status: 'verified',
      approvedAt: at,
      proof: { ...proof, state: 'approved', reviewedAt: at },
    },
  ])
    expect(bookingUpfrontSchema.safeParse(value).success).toBe(true);
  for (const value of [
    { ...base, status: 'verified', approvedAt: at, proof },
    { ...base, status: 'verification_pending', approvedAt: null, proof },
    { ...base, status: 'awaiting_approval', approvedAt: at, proof: null },
    { ...base, status: 'awaiting_payment', approvedAt: at, proof },
    { ...base, amountPaisa: 0, status: 'awaiting_approval', approvedAt: null, proof: null },
    {
      ...base,
      status: 'verified',
      approvedAt: at,
      proof: { ...proof, state: 'approved', reviewedAt: null },
    },
    {
      ...base,
      status: 'awaiting_payment',
      approvedAt: at,
      proof: { ...proof, state: 'rejected', reviewedAt: at, reviewReason: null },
    },
  ])
    expect(bookingUpfrontSchema.safeParse(value).success).toBe(false);
});
it('BKG-007/008: proof, review and instruction inputs are strict and bounded', () => {
  expect(
    bookingProofInputSchema.parse({
      fileId: id.toUpperCase(),
      amountPaisa: 2300000,
      method: 'jazzcash',
      paidOn: '2026-10-25',
      reference: ' TRX ',
    }),
  ).toMatchObject({ fileId: id, reference: 'TRX' });
  for (const input of [
    { fileId: id, amountPaisa: 0, method: 'cash', paidOn: '2026-10-25', reference: null },
    { fileId: id, amountPaisa: 1.5, method: 'cash', paidOn: '2026-10-25', reference: null },
    { fileId: id, amountPaisa: 1, method: 'wallet', paidOn: '2026-10-25', reference: null },
    { fileId: id, amountPaisa: 1, method: 'cash', paidOn: '2026-02-30', reference: null },
    {
      fileId: id,
      amountPaisa: 1,
      method: 'cash',
      paidOn: '2026-10-25',
      reference: null,
      state: 'approved',
    },
  ])
    expect(bookingProofInputSchema.safeParse(input).success).toBe(false);
  expect(bookingProofReviewSchema.safeParse({ decision: 'reject', reason: ' ' }).success).toBe(
    false,
  );
  expect(bookingProofReviewSchema.safeParse({ decision: 'approve', reason: 'x' }).success).toBe(
    false,
  );
  expect(
    paymentInstructionInputSchema.safeParse({
      method: 'bank_transfer',
      accountTitle: 'Hostel Pvt Ltd',
      accountIdentifier: 'PK00TEST0000000000000000',
      instructions: null,
    }).success,
  ).toBe(true);
  expect(
    paymentInstructionInputSchema.safeParse({
      method: 'bank_transfer',
      accountTitle: 'x'.repeat(121),
      accountIdentifier: 'x',
      instructions: null,
    }).success,
  ).toBe(false);
});
