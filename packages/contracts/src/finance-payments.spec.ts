import { expect, it } from 'vitest';
import {
  externalPaymentMethodSchema,
  recordExternalPaymentInputSchema,
  newResidentPaymentInputSchema,
  residentReceiptSnapshotSchema,
  paymentReversalInputSchema,
} from './finance-payments.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const other = '019a1234-1234-7123-8123-123456789abd';
const input = {
  amountPaisa: 3000001,
  method: 'cash',
  paidOn: '2028-02-01',
  note: 'Received directly by hostel',
  allocations: [{ invoiceId: id, amountPaisa: 1800001 }],
  depositPaisa: 1000000,
  advanceCreditPaisa: 200000,
};
const snapshot = {
  version: 1,
  currency: 'PKR',
  paymentId: id,
  branchId: id,
  stayId: id,
  residentName: 'Ali',
  hostelName: 'HSM fixture hostel',
  branchName: 'Islamabad fixture',
  amountPaisa: 3000001,
  method: 'cash',
  transactionReference: null,
  paidOn: '2028-02-01',
  approvedAt: '2028-02-01T06:00:00.000Z',
  allocations: [{ invoiceId: id, invoiceNumber: 'INV-1', amountPaisa: 1800001 }],
  distribution: { allocatedPaisa: 1800001, depositPaisa: 1000000, advanceCreditPaisa: 200000 },
};
it('PAY-008 / RENT-005: actual partial/excess payment partition serializes every paisa exactly', () => {
  expect(recordExternalPaymentInputSchema.parse(input)).toEqual(input);
  expect(
    recordExternalPaymentInputSchema.parse({
      ...input,
      transactionReference: ' BANK-1 ',
      proofFileId: other,
    }),
  ).toEqual({ ...input, transactionReference: 'BANK-1', proofFileId: other });
  const value = residentReceiptSnapshotSchema.parse(snapshot);
  expect(JSON.parse(JSON.stringify(value))).toEqual(snapshot);
});
it.each(['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'other'])(
  'PAY-008: external hostel method %s is controlled',
  (method) => {
    expect(externalPaymentMethodSchema.parse(method)).toBe(method);
  },
);
it.each([
  {
    ...input,
    allocations: [
      { invoiceId: id, amountPaisa: 1800001 },
      { invoiceId: id.toUpperCase(), amountPaisa: 1 },
    ],
  },
  { ...input, allocations: [{ invoiceId: id, amountPaisa: 1.1 }] },
  {
    ...input,
    allocations: [
      { invoiceId: id, amountPaisa: Number.MAX_SAFE_INTEGER },
      { invoiceId: other, amountPaisa: 1 },
    ],
  },
  { ...input, amountPaisa: 1.1 },
  { ...input, advanceCreditPaisa: 0 },
  { ...input, approvedByUserId: id },
  { ...input, state: 'paid' },
  { ...input, bankVerified: true },
  { ...input, paidOn: '2028-02-30' },
  { ...input, allocations: Array.from({ length: 101 }, () => ({ invoiceId: id, amountPaisa: 1 })) },
])(
  'SEC-003 / PAY-008: unsafe payment input %j is rejected without bigint coercion errors',
  (value) => {
    expect(recordExternalPaymentInputSchema.safeParse(value).success).toBe(false);
  },
);
it('PAY-008 / ACC-003: the exact safe transport limit can be allocated without floating arithmetic', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(
    recordExternalPaymentInputSchema.parse({
      ...input,
      amountPaisa: max,
      allocations: [{ invoiceId: id, amountPaisa: max - 2 }],
      depositPaisa: 1,
      advanceCreditPaisa: 1,
    }).amountPaisa,
  ).toBe(max);
  expect(
    recordExternalPaymentInputSchema.parse({
      ...input,
      allocations: [],
      amountPaisa: 1000001,
      depositPaisa: 1000001,
      advanceCreditPaisa: 0,
    }).allocations,
  ).toEqual([]);
});
it.each([
  { ...snapshot, amountPaisa: 1 },
  {
    ...snapshot,
    distribution: { ...snapshot.distribution, allocatedPaisa: 1800000, advanceCreditPaisa: 200001 },
  },
  { ...snapshot, allocations: [{ ...snapshot.allocations[0], amountPaisa: 1.1 }] },
  { ...snapshot, distribution: { ...snapshot.distribution, allocatedPaisa: 1.1 } },
  { ...snapshot, currency: 'USD' },
  { ...snapshot, cnic: 'private-document-content' },
  { ...snapshot, password: 'not-a-receipt-field' },
  { ...snapshot, allocations: [...snapshot.allocations, ...snapshot.allocations] },
])('PAY-008 / SEC-003: inconsistent or over-disclosed receipt %j is rejected', (value) => {
  expect(residentReceiptSnapshotSchema.safeParse(value).success).toBe(false);
});
it('Q14 / PAY-008: reversal requests contain a reason, never a client balance or negative payment', () => {
  expect(paymentReversalInputSchema.parse({ reason: ' Wrong original payment ' })).toEqual({
    reason: 'Wrong original payment',
  });
  expect(paymentReversalInputSchema.safeParse({ reason: ' ' }).success).toBe(false);
  expect(
    paymentReversalInputSchema.safeParse({ reason: 'Correction', amountPaisa: -1 }).success,
  ).toBe(false);
});

it('PAY-008 / CHG-055: new collections reject excess while historical receipt parsing remains valid', () => {
  expect(newResidentPaymentInputSchema.safeParse(input).success).toBe(false);
  expect(
    newResidentPaymentInputSchema.safeParse({
      ...input,
      amountPaisa: 2800001,
      advanceCreditPaisa: 0,
    }).success,
  ).toBe(true);
  expect(recordExternalPaymentInputSchema.safeParse(input).success).toBe(true);
});
