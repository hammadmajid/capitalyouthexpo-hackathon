import { expect, it } from 'vitest';
import {
  manualStayInputSchema,
  stayExtensionInputSchema,
  stayNoticeInputSchema,
  stayAgreementAmendmentInputSchema,
} from './stay-commands.js';
import {
  recordExternalPaymentInputSchema,
  residentReceiptSnapshotSchema,
} from './finance-payments.js';
import { staySummarySchema } from './stay-reads.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const terms = {
  policyVersionId: id,
  currency: 'PKR',
  fees: [],
  catalog: [],
  rentAmountPaisa: 100,
  depositPaisa: 0,
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 7,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
  },
};
const cases = [
  {
    name: 'manual admission period',
    schema: manualStayInputSchema,
    body: (date: string) => ({
      resident: { kind: 'new', profile: { displayName: 'Resident fixture' } },
      target: { kind: 'room', roomId: id },
      period: { moveInDate: date, expectedLeaveDate: date.slice(0, 4) + '-02-01' },
      terms,
    }),
  },
  {
    name: 'extension date',
    schema: stayExtensionInputSchema,
    body: (date: string) => ({
      expectedVersion: 1,
      expectedLeaveDate: date,
      reason: 'Explicit extension',
    }),
  },
  {
    name: 'notice date',
    schema: stayNoticeInputSchema,
    body: (date: string) => ({
      expectedVersion: 1,
      requestedCheckoutDate: date,
      isEmergency: false,
    }),
  },
  {
    name: 'agreement effective date',
    schema: stayAgreementAmendmentInputSchema,
    body: (date: string) => ({
      expectedVersion: 1,
      effectiveFrom: date,
      terms,
      reason: 'Explicit amendment',
    }),
  },
  {
    name: 'external payment date',
    schema: recordExternalPaymentInputSchema,
    body: (date: string) => ({
      amountPaisa: 100,
      method: 'cash',
      paidOn: date,
      note: 'Received by hostel',
      allocations: [],
      depositPaisa: 100,
      advanceCreditPaisa: 0,
    }),
  },
  {
    name: 'receipt payment date',
    schema: residentReceiptSnapshotSchema,
    body: (date: string) => ({
      version: 1,
      currency: 'PKR',
      paymentId: id,
      branchId: id,
      stayId: id,
      residentName: 'Resident fixture',
      hostelName: 'Hostel fixture',
      branchName: 'Branch fixture',
      amountPaisa: 100,
      method: 'cash',
      transactionReference: null,
      paidOn: date,
      approvedAt: '2028-02-01T06:00:00.000Z',
      allocations: [],
      distribution: { allocatedPaisa: 0, depositPaisa: 100, advanceCreditPaisa: 0 },
    }),
  },
  {
    name: 'private Stay move-in date',
    schema: staySummarySchema,
    body: (date: string) => ({
      id,
      branchId: id,
      residentId: id,
      displayName: 'Resident fixture',
      source: 'manual',
      state: 'check_in_ready',
      version: 1,
      moveInDate: date,
      expectedLeaveDate: null,
      checkedInAt: null,
      closedAt: null,
      currentAssignment: null,
    }),
  },
];
it.each(cases)(
  'STAY-001 / PAY-008 / SEC-003: $name rejects year zero before a PostgreSQL operation',
  ({ schema, body }) => {
    expect(schema.safeParse(body('0000-01-01')).success).toBe(false);
  },
);
it.each(cases)(
  'STAY-001 / PAY-008: $name preserves the first valid AD year',
  ({ schema, body }) => {
    expect(schema.safeParse(body('0001-01-01')).success).toBe(true);
  },
);
