import { expect, it } from 'vitest';
import { externalPaymentDraftSchema } from './external-payment-draft.js';
const invoice = '10000000-0000-4000-8000-000000000003';
const draft = {
  amount: '10.01',
  method: 'cash',
  paidOn: '2028-03-01',
  note: ' Paid directly ',
  transactionReference: '',
  deposit: '0',
  advanceCredit: '0',
  allocations: [{ invoiceId: invoice, amount: '10.01' }],
};
it('PAY-008 / FIN-001: exact PKR draft maps to explicit conserved integer paisa without inferred funds', () => {
  expect(externalPaymentDraftSchema.parse(draft)).toEqual({
    amountPaisa: 1001,
    method: 'cash',
    paidOn: '2028-03-01',
    note: 'Paid directly',
    depositPaisa: 0,
    advanceCreditPaisa: 0,
    allocations: [{ invoiceId: invoice, amountPaisa: 1001 }],
  });
});
it.each([
  '',
  ' ',
  '-1',
  '+1',
  '1e2',
  '1,000',
  '.5',
  '1.001',
  'NaN',
  'Infinity',
  '90071992547409.92',
  '99999999999999.99',
  '100000000000000',
  '0',
  '0.00',
])('PAY-008: invalid or unsafe positive total %s fails before posting', (amount) => {
  expect(externalPaymentDraftSchema.safeParse({ ...draft, amount }).success).toBe(false);
});
it.each([
  { deposit: '' },
  { advanceCredit: '' },
  { method: '' },
  { paidOn: '' },
  { note: 'a'.repeat(501) },
  { amount: '10' },
  { allocations: [] },
  { allocations: [...draft.allocations, ...draft.allocations] },
  { allocations: [{ invoiceId: 'bad', amount: '10.01' }] },
  { allocations: [{ invoiceId: invoice, amount: '0' }] },
  { approvedByUserId: invoice },
  { proofFileId: 'bad' },
  { transactionReference: 'a'.repeat(161) },
])(
  'PAY-008 / SEC-003: incomplete, unconserved or authority-expanded draft fails closed %#',
  (patch) => {
    expect(externalPaymentDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
  },
);
it('FIN-001: transport maximum and one paisa are converted exactly with no rounding', () => {
  const maximum = externalPaymentDraftSchema.parse({
    ...draft,
    amount: '90071992547409.91',
    allocations: [{ invoiceId: invoice, amount: '90071992547409.91' }],
  });
  expect(maximum.amountPaisa).toBe(Number.MAX_SAFE_INTEGER);
  expect(maximum.allocations[0]?.amountPaisa).toBe(Number.MAX_SAFE_INTEGER);
  expect(
    externalPaymentDraftSchema.parse({
      ...draft,
      amount: '0.01',
      allocations: [{ invoiceId: invoice, amount: '0.01' }],
    }).amountPaisa,
  ).toBe(1);
});
it('PAY-008: explicitly selected deposit and bills and optional own proof/reference retain exact partitions', () => {
  expect(
    externalPaymentDraftSchema.parse({
      ...draft,
      amount: ' 5.1 ',
      deposit: '3.10',
      advanceCredit: '0',
      allocations: [{ invoiceId: invoice, amount: '2' }],
      proofFileId: invoice,
      transactionReference: ' External reference ',
    }),
  ).toMatchObject({
    amountPaisa: 510,
    depositPaisa: 310,
    advanceCreditPaisa: 0,
    allocations: [{ invoiceId: invoice, amountPaisa: 200 }],
    proofFileId: invoice,
    transactionReference: 'External reference',
  });
});
it('PAY-008: an empty note is optional and saved as a plain default', () => {
  expect(externalPaymentDraftSchema.parse({ ...draft, note: '  ' }).note).toBe('Payment recorded');
});

it('PAY-008 / CHG-055: an excess advance draft is rejected', () => {
  expect(
    externalPaymentDraftSchema.safeParse({ ...draft, amount: '11.01', advanceCredit: '1' }).success,
  ).toBe(false);
});
