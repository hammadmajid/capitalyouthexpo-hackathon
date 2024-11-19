import { expect, it } from 'vitest';
import { residentInvoiceBalanceSchema, residentInvoicePageSchema } from './finance-reads.js';
const first = '10000000-0000-4000-8000-000000000001',
  second = '10000000-0000-4000-8000-000000000002';
const invoice = {
  invoiceId: first,
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2028-02-05',
  graceDays: 2,
  totalPaisa: 1000,
  debitAdjustmentsPaisa: 100,
  creditAdjustmentsPaisa: 100,
  allocatedPaisa: 0,
  outstandingPaisa: 1000,
  state: 'issued',
};
it.each([
  { state: 'issued', allocatedPaisa: 0, outstandingPaisa: 1000 },
  { state: 'partially_paid', allocatedPaisa: 300, outstandingPaisa: 700 },
  { state: 'overdue', allocatedPaisa: 0, outstandingPaisa: 1000 },
  { state: 'paid', allocatedPaisa: 1000, outstandingPaisa: 0 },
  { state: 'no_charge', allocatedPaisa: 0, creditAdjustmentsPaisa: 1100, outstandingPaisa: 0 },
  { state: 'voided', allocatedPaisa: 0, creditAdjustmentsPaisa: 1100, outstandingPaisa: 0 },
])('FIN-001 / PAY-008: exact coherent $state projection is accepted', (patch) => {
  expect(residentInvoiceBalanceSchema.parse({ ...invoice, ...patch })).toEqual({
    ...invoice,
    ...patch,
  });
});
it.each([
  { state: 'paid' },
  { state: 'paid', allocatedPaisa: 0, creditAdjustmentsPaisa: 1100, outstandingPaisa: 0 },
  { state: 'issued', allocatedPaisa: 300, outstandingPaisa: 700 },
  { state: 'partially_paid' },
  { state: 'no_charge' },
  { state: 'no_charge', allocatedPaisa: 1000, outstandingPaisa: 0 },
  { state: 'voided', allocatedPaisa: 1000, outstandingPaisa: 0 },
  { state: 'overdue', allocatedPaisa: 1000, outstandingPaisa: 0 },
  { outstandingPaisa: 999 },
  { allocatedPaisa: 1001, outstandingPaisa: 0 },
  { creditAdjustmentsPaisa: 1101, outstandingPaisa: 0 },
])('PAY-008 / FIN-001: inconsistent or invented financial state %# is rejected', (patch) => {
  expect(residentInvoiceBalanceSchema.safeParse({ ...invoice, ...patch }).success).toBe(false);
});
it.each([
  { amountPaisa: 1 },
  { actorUserId: first },
  { cnic: '12345-1234567-1' },
  { proofUrl: 'https://example.test/private' },
  { invoiceId: 'invalid' },
  { currency: 'USD' },
  { dueDate: '2028-02-30' },
  { graceDays: -1 },
  { totalPaisa: 0.1 },
  { outstandingPaisa: 0.1 },
  { allocatedPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { debitAdjustmentsPaisa: -1 },
])('SEC-003: invalid or sensitive invoice producer payload %# fails closed', (patch) => {
  expect(residentInvoiceBalanceSchema.safeParse({ ...invoice, ...patch }).success).toBe(false);
});
it('FIN-001: exact maximum safe integer paisa remain lossless in invoice reads', () => {
  expect(
    residentInvoiceBalanceSchema.parse({
      ...invoice,
      totalPaisa: Number.MAX_SAFE_INTEGER,
      debitAdjustmentsPaisa: 0,
      creditAdjustmentsPaisa: 0,
      outstandingPaisa: Number.MAX_SAFE_INTEGER,
    }).outstandingPaisa,
  ).toBe(Number.MAX_SAFE_INTEGER);
});
it('RES-001: empty invoice page and a terminal bounded page preserve honest absence', () => {
  expect(residentInvoicePageSchema.parse({ data: [], nextCursor: null })).toEqual({
    data: [],
    nextCursor: null,
  });
  expect(
    residentInvoicePageSchema.parse({ data: [invoice], nextCursor: null }).nextCursor,
  ).toBeNull();
});
it('FIN-001: invoice pages preserve exact increasing continuation identity', () => {
  expect(
    residentInvoicePageSchema.parse({
      data: [invoice, { ...invoice, invoiceId: second }],
      nextCursor: second,
    }).nextCursor,
  ).toBe(second);
});
it.each([
  { data: [], nextCursor: first },
  { data: [invoice], nextCursor: second },
  { data: [invoice, invoice], nextCursor: first },
  { data: [{ ...invoice, invoiceId: second }, invoice], nextCursor: null },
  { data: [invoice], nextCursor: null, total: 1 },
  { data: Array.from({ length: 101 }, () => invoice), nextCursor: null },
])(
  'FIN-001 / SEC-003: invalid, duplicate, reversed or unbounded invoice page %# is rejected',
  (value) => {
    expect(residentInvoicePageSchema.safeParse(value).success).toBe(false);
  },
);
