import { expect, it } from 'vitest';
import {
  bookingAdmissionCommandSchema,
  bookingAdmissionResultSchema,
} from './booking-admission.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const rent = { item: 'rent', cadence: 'periodic', periodIndex: 4 };
const input = { policyVersionId: id, initialBilling: [rent] };
it('BKG-004 / STAY-001: check-in accepts explicit policy and period starts without client-owned booking facts', () => {
  expect(
    bookingAdmissionCommandSchema.parse({ ...input, policyVersionId: id.toUpperCase() }),
  ).toEqual(input);
});
it('RENT-003 / FIN-004: independent original-fee cursors and an explicit zero partial amount are retained unchanged', () => {
  const initialBilling = [
    { ...rent, manualAmountPaisa: 0 },
    { item: 'mess', cadence: 'periodic', periodIndex: 2, manualAmountPaisa: 501 },
    { item: 'admission', cadence: 'one_time', periodIndex: 0 },
  ];
  expect(bookingAdmissionCommandSchema.parse({ ...input, initialBilling }).initialBilling).toEqual(
    initialBilling,
  );
});
it.each([
  { policyVersionId: id },
  { initialBilling: [rent] },
  { ...input, policyVersionId: 'bad' },
  { ...input, initialBilling: [] },
  { ...input, initialBilling: [{ item: 'mess', cadence: 'periodic', periodIndex: 0 }] },
  { ...input, initialBilling: [{ ...rent, cadence: 'one_time' }] },
  { ...input, initialBilling: [rent, { ...rent, periodIndex: 5 }] },
  { ...input, initialBilling: [rent, { ...rent, cadence: 'one_time' }] },
  {
    ...input,
    initialBilling: [
      rent,
      { item: 'mess', cadence: 'periodic', periodIndex: 0 },
      { item: 'mess', cadence: 'periodic', periodIndex: 1 },
    ],
  },
  { ...input, initialBilling: [{ ...rent, periodIndex: -1 }] },
  { ...input, initialBilling: [{ ...rent, periodIndex: 0.5 }] },
  { ...input, initialBilling: [{ ...rent, periodIndex: Number.MAX_SAFE_INTEGER }] },
  { ...input, initialBilling: [{ ...rent, manualAmountPaisa: -1 }] },
  { ...input, initialBilling: [{ ...rent, manualAmountPaisa: 0.5 }] },
  { ...input, initialBilling: [{ ...rent, manualAmountPaisa: '1' }] },
  { ...input, initialBilling: [{ ...rent, manualAmountPaisa: 9007199254740992 }] },
  { ...input, initialBilling: Array.from({ length: 34 }, () => rent) },
])('BKG-004 / RENT-003: malformed, duplicate or incomplete starts reject (%#)', (value) => {
  expect(bookingAdmissionCommandSchema.safeParse(value).success).toBe(false);
});
it.each([
  'bookingId',
  'branchId',
  'userId',
  'residentId',
  'target',
  'terms',
  'bookingSnapshot',
  'quote',
  'state',
  'checkedInAt',
  'documentsApproved',
  'consent',
  'upfrontApproved',
  'paymentId',
  'receiptId',
  'actorRole',
])('SEC-003 / BKG-004: client injection of %s cannot substitute for server facts', (key) => {
  expect(bookingAdmissionCommandSchema.safeParse({ ...input, [key]: id }).success).toBe(false);
});
it('SEC-003: period selectors reject injected billing authority', () => {
  expect(
    bookingAdmissionCommandSchema.safeParse({
      ...input,
      initialBilling: [{ ...rent, systemExecutionId: id }],
    }).success,
  ).toBe(false);
});
const result = {
  branchId: id,
  stayId: id,
  residentId: id,
  agreementId: id,
  assignmentId: id,
  bookingId: id,
  state: 'active',
  version: 1,
};
it('BKG-004 / RES-004: result identifies the fulfilled booking and active Stay without changing reservation history', () => {
  expect(bookingAdmissionResultSchema.parse({ ...result, bookingId: id.toUpperCase() })).toEqual(
    result,
  );
});
it.each([
  { ...result, bookingId: undefined },
  { ...result, bookingId: 'bad' },
  { ...result, state: 'confirmed' },
  { ...result, version: 2 },
  { ...result, customerEmail: 'private@example.invalid' },
  { ...result, bookingState: 'checked_in' },
  { ...result, receiptId: id },
  { ...result, invoiceIds: [id] },
])('SEC-003 / BKG-004: invalid or privacy-expanded check-in result rejects (%#)', (value) => {
  expect(bookingAdmissionResultSchema.safeParse(value).success).toBe(false);
});

it('RENT-003 / FIN-004: disclosed-fee input order does not confer rent defaults or change the explicit starts', () => {
  const initialBilling = [{ item: 'mess', cadence: 'periodic', periodIndex: 2 }, rent];
  expect(bookingAdmissionCommandSchema.parse({ ...input, initialBilling }).initialBilling).toEqual(
    initialBilling,
  );
});
