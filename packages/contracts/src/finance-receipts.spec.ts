import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { residentReceiptDetailSchema, recordedResidentPaymentSchema } from './finance-receipts.js';
const paymentId = randomUUID(),
  receiptId = randomUUID();
const snapshot = {
  version: 1,
  currency: 'PKR',
  paymentId,
  branchId: randomUUID(),
  stayId: randomUUID(),
  residentName: 'Historical resident',
  hostelName: 'Historical hostel',
  branchName: 'Historical branch',
  amountPaisa: 1001,
  method: 'cash',
  transactionReference: null,
  paidOn: '2028-02-01',
  approvedAt: '2028-02-01T06:00:00.000Z',
  allocations: [],
  distribution: { allocatedPaisa: 0, depositPaisa: 1000, advanceCreditPaisa: 1 },
};
const receipt = {
  receiptId,
  receiptNumber: 'R-1',
  issuedAt: '2028-02-01T06:00:00.000Z',
  snapshot,
  reversed: false,
};
const result = { paymentId, receiptId, receiptNumber: 'R-1', amountPaisa: 1001 };
it.each([false, true])(
  'PAY-008: historical receipt facts remain valid when derived reversed marker is%s',
  (reversed) => {
    expect(residentReceiptDetailSchema.parse({ ...receipt, reversed })).toEqual({
      ...receipt,
      reversed,
    });
  },
);
it.each([
  { ...receipt, receiptId: 'bad' },
  { ...receipt, receiptNumber: '' },
  { ...receipt, issuedAt: 'bad' },
  { ...receipt, reversed: 'false' },
  { ...receipt, proofFileId: randomUUID() },
  { ...receipt, note: 'Private' },
  { ...receipt, snapshot: { ...snapshot, cnic: 'Private' } },
  {
    ...receipt,
    snapshot: { ...snapshot, distribution: { ...snapshot.distribution, allocatedPaisa: 1 } },
  },
])('SEC-003 / FIN-001: invalid or private-extended receipt producer %# is rejected', (value) => {
  expect(residentReceiptDetailSchema.safeParse(value).success).toBe(false);
});
it('PAY-008: compact approved-payment result contains validated identifiers and integer paisa only', () => {
  expect(recordedResidentPaymentSchema.parse(result)).toEqual(result);
});
it.each([
  { ...result, paymentId: 'bad' },
  { ...result, receiptId: 'bad' },
  { ...result, receiptNumber: '' },
  { ...result, amountPaisa: 0 },
  { ...result, amountPaisa: 0.1 },
  { ...result, amountPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { ...result, bankVerified: true },
  { ...result, proofFileId: randomUUID() },
])('SEC-003 / FIN-001: invalid or fabricated payment response %# is rejected', (value) => {
  expect(recordedResidentPaymentSchema.safeParse(value).success).toBe(false);
});
