import { expect, it } from 'vitest';
import {
  admissionBillingSelectionSchema,
  hasCompleteAdmissionSelection,
  manualAdmissionCommandSchema,
  manualAdmissionResultSchema,
  type AdmissionBillingSelection,
} from './manual-admission.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'catalog_only',
};
const manual = {
  resident: {
    kind: 'new',
    profile: { displayName: '  Resident  ', email: ' Resident@EXAMPLE.invalid ' },
  },
  target: { kind: 'bed', roomId: id, bedId: id },
  period: { moveInDate: '2028-02-01', expectedLeaveDate: '2028-03-01' },
  terms: {
    policyVersionId: id,
    currency: 'PKR',
    fees: [],
    catalog: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 1000001,
    policy,
  },
};
const rent: AdmissionBillingSelection = { item: 'rent', cadence: 'periodic', periodIndex: 4 };
const input = { manual, initialBilling: [rent] };
it('STAY-001 / RES-003 / RENT-003: public command retains explicit initial cursor and normalized manual relationship without authority or inferred payment', () => {
  const parsed = manualAdmissionCommandSchema.parse(input);
  expect(parsed.initialBilling).toEqual([rent]);
  expect(parsed.manual.resident).toEqual({
    kind: 'new',
    profile: { displayName: 'Resident', email: 'resident@example.invalid' },
  });
  expect(parsed.manual.terms.rentAmountPaisa).toBe(1800001);
  expect(parsed.manual.terms.depositPaisa).toBe(1000001);
});
it('RES-003: existing branch relationship reference is explicit and normalized', () => {
  expect(
    manualAdmissionCommandSchema.parse({
      ...input,
      manual: { ...manual, resident: { kind: 'existing', residentId: id.toUpperCase() } },
    }).manual.resident,
  ).toEqual({ kind: 'existing', residentId: id });
});
it('RENT-003/004: required selections include each disclosed cadence exactly once, with no source or amount defaults', () => {
  const fees = [
    { code: 'mess' as const, cadence: 'monthly' as const, amountPaisa: 501 },
    { code: 'admission' as const, cadence: 'one_time' as const, amountPaisa: 777 },
  ];
  const initialBilling: AdmissionBillingSelection[] = [
    rent,
    { item: 'mess', cadence: 'periodic', periodIndex: 2, manualAmountPaisa: 501 },
    { item: 'admission', cadence: 'one_time', periodIndex: 0 },
  ];
  expect(hasCompleteAdmissionSelection({ fees }, initialBilling)).toBe(true);
  expect(
    manualAdmissionCommandSchema.parse({
      ...input,
      manual: { ...manual, terms: { ...manual.terms, fees } },
      initialBilling,
    }).initialBilling,
  ).toEqual(initialBilling);
});
it.each([
  { initialBilling: [] },
  { initialBilling: [rent, rent] },
  { initialBilling: [{ ...rent, cadence: 'one_time' }] },
  { initialBilling: [rent, { item: 'mess', cadence: 'periodic', periodIndex: 0 }] },
])(
  'FIN-004: missing, duplicate or undisclosed starting selection %# is not an agreement',
  ({ initialBilling }) => {
    expect(manualAdmissionCommandSchema.safeParse({ ...input, initialBilling }).success).toBe(
      false,
    );
  },
);
it('RENT-003: omitted or replaced disclosed fees cannot be hidden by a same-sized selection', () => {
  const fees = [{ code: 'mess' as const, cadence: 'monthly' as const, amountPaisa: 501 }];
  expect(hasCompleteAdmissionSelection({ fees }, [rent])).toBe(false);
  expect(
    hasCompleteAdmissionSelection({ fees }, [
      rent,
      { item: 'utilities', cadence: 'periodic', periodIndex: 0 },
    ]),
  ).toBe(false);
});
it.each([
  { scope: { actorRole: 'owner' } },
  { expectedUserId: id },
  { branchId: id },
  { actorUserId: id },
  { state: 'active' },
  { receiptId: id },
  {
    manual: {
      ...manual,
      resident: { kind: 'new', profile: { displayName: 'Resident', userId: id } },
    },
  },
])(
  'SEC-003: injected server authority, identity or completion facts %# reject at public boundary',
  (patch) => {
    expect(manualAdmissionCommandSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  },
);
it.each([
  { periodIndex: -1 },
  { periodIndex: 0.5 },
  { periodIndex: Number.MAX_SAFE_INTEGER },
  { manualAmountPaisa: -1 },
  { manualAmountPaisa: 0.1 },
  { manualAmountPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { manualAmountPaisa: 1n },
  { item: 'arbitrary' },
  { cadence: 'daily' },
  { sourceKey: 'forged' },
])('SEC-003 / FIN-004: invalid exact-money/cursor or arbitrary selection %# rejects', (patch) => {
  expect(admissionBillingSelectionSchema.safeParse({ ...rent, ...patch }).success).toBe(false);
});
it.each([0, Number.MAX_SAFE_INTEGER])(
  'RENT-003: an explicitly chosen safe manual amount %s is not defaulted or rounded',
  (manualAmountPaisa) => {
    expect(
      admissionBillingSelectionSchema.parse({ ...rent, manualAmountPaisa }).manualAmountPaisa,
    ).toBe(manualAmountPaisa);
  },
);
const result = {
  branchId: id,
  stayId: id,
  residentId: id,
  agreementId: id,
  assignmentId: id,
  state: 'active',
  version: 1,
};
it('STAY-001 / SEC-003: admission response contains only normalized scoped resource references and initial state', () => {
  expect(manualAdmissionResultSchema.parse({ ...result, branchId: id.toUpperCase() })).toEqual(
    result,
  );
});
it.each([
  { branchId: 'bad' },
  { stayId: 'bad' },
  { residentId: 'bad' },
  { agreementId: 'bad' },
  { assignmentId: 'bad' },
  { state: 'paid' },
  { version: 2 },
  { userId: id },
  { phone: '+923001234567' },
])(
  'SEC-003: malformed or private/invented result data %# is not a successful admission',
  (patch) => {
    expect(manualAdmissionResultSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  },
);

it('RES-001 / SEC-003: an optional CNIC photo is accepted only for a new manual resident', () => {
  expect(
    manualAdmissionCommandSchema.parse({ ...input, cnicPhotoFileId: id }).cnicPhotoFileId,
  ).toBe(id);
  expect(
    manualAdmissionCommandSchema.safeParse({
      ...input,
      cnicPhotoFileId: id,
      manual: { ...manual, resident: { kind: 'existing', residentId: id } },
    }).success,
  ).toBe(false);
});
