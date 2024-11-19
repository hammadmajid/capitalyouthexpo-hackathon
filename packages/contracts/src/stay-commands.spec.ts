import { expect, it } from 'vitest';
import {
  stayStateSchema,
  staySourceSchema,
  stayPeriodSchema,
  residentProfileInputSchema,
} from './stay-values.js';
import {
  bookingCheckInInputSchema,
  manualStayInputSchema,
  stayTransferInputSchema,
  stayExtensionInputSchema,
  stayNoticeInputSchema,
  stayCheckoutInputSchema,
  stayTerminationInputSchema,
  stayAgreementAmendmentInputSchema,
  stayDirectoryQuerySchema,
} from './stay-commands.js';
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
const terms = {
  policyVersionId: id,
  currency: 'PKR',
  catalog: [],
  fees: [],
  rentAmountPaisa: 1800001,
  depositPaisa: 1500000,
  policy,
};
const manual = {
  resident: { kind: 'new', profile: { displayName: 'Ali' } },
  target: { kind: 'bed', roomId: id, bedId: id },
  period: { moveInDate: '2028-02-29', expectedLeaveDate: '2028-03-10' },
  terms,
};
it.each([
  'check_in_ready',
  'active',
  'notice_given',
  'checkout_pending',
  'completed',
  'cancelled_before_checkin',
  'terminated',
  'abandoned',
])('STAY-001/004: lifecycle value %s is bounded', (value) => {
  expect(stayStateSchema.parse(value)).toBe(value);
});
it('STAY-001 / RES-001: source is not a mutually-exclusive auth role', () => {
  expect(staySourceSchema.parse('booking')).toBe('booking');
  expect(staySourceSchema.parse('manual')).toBe('manual');
  expect(staySourceSchema.safeParse('manager').success).toBe(false);
});
it('RES-001/003 / SEC-003: branch-local profile has no invented credentials or automatic identity merge', () => {
  const profile = residentProfileInputSchema.parse({
    displayName: '  Ali \u0639\u0644\u06cc \u{1F600}  ',
    phone: '+923001234567',
    email: ' Ali@Example.test ',
  });
  expect(profile.email).toBe('ali@example.test');
  expect(profile.displayName).toContain('Ali');
  for (const extra of [
    { userId: id },
    { password: 'not-an-account' },
    { cnic: '1234567890123' },
    { emailVerified: true },
  ])
    expect(residentProfileInputSchema.safeParse({ ...profile, ...extra }).success).toBe(false);
  for (const displayName of [' ', String.fromCharCode(0), String.fromCharCode(0xd800)])
    expect(residentProfileInputSchema.safeParse({ displayName }).success).toBe(false);
});
it('STAY-001 / RES-003: explicit finite and open-ended periods are distinct', () => {
  expect(stayPeriodSchema.parse(manual.period)).toEqual(manual.period);
  expect(
    stayPeriodSchema.parse({ moveInDate: '2028-02-29', expectedLeaveDate: null }).expectedLeaveDate,
  ).toBeNull();
  for (const expectedLeaveDate of ['2028-02-29', '2028-02-28', '2028-02-30'])
    expect(
      stayPeriodSchema.safeParse({ moveInDate: '2028-02-29', expectedLeaveDate }).success,
    ).toBe(false);
});
it('RES-001 / RENT-003: manual admission preserves selected target and complete agreed terms', () => {
  expect(manualStayInputSchema.parse(manual).terms.rentAmountPaisa).toBe(1800001);
  expect(
    manualStayInputSchema.parse({
      ...manual,
      resident: { kind: 'existing', residentId: id.toUpperCase() },
      target: { kind: 'room', roomId: id },
    }).resident,
  ).toEqual({ kind: 'existing', residentId: id });
  expect(manualStayInputSchema.safeParse({ ...manual, state: 'active' }).success).toBe(false);
  expect(manualStayInputSchema.safeParse({ ...manual, customerUserId: id }).success).toBe(false);
});
it('RES-001 / RENT-001: open-ended and term billing cannot silently invent a period', () => {
  const open = { ...manual, period: { moveInDate: '2028-02-29', expectedLeaveDate: null } };
  expect(manualStayInputSchema.safeParse(open).success).toBe(false);
  const allowed = { ...open, terms: { ...terms, policy: { ...policy, allowOpenEnded: true } } };
  expect(manualStayInputSchema.parse(allowed).period.expectedLeaveDate).toBeNull();
  expect(
    manualStayInputSchema.safeParse({
      ...allowed,
      terms: {
        ...allowed.terms,
        policy: { ...allowed.terms.policy, cycle: { kind: 'term', dueOffsetDays: 0 } },
      },
    }).success,
  ).toBe(false);
  expect(
    manualStayInputSchema.safeParse({
      ...manual,
      terms: { ...terms, policy: { ...policy, cycle: { kind: 'term', dueOffsetDays: 0 } } },
    }).success,
  ).toBe(true);
});
it('STAY-001 / ACC-002: check-in body cannot replace the stored booking customer, inventory or price', () => {
  expect(bookingCheckInInputSchema.parse({ policyVersionId: id })).toEqual({ policyVersionId: id });
  for (const extra of [
    { customerUserId: id },
    { target: manual.target },
    { rentAmountPaisa: 1 },
    { state: 'active' },
  ])
    expect(bookingCheckInInputSchema.safeParse({ policyVersionId: id, ...extra }).success).toBe(
      false,
    );
});
it('RES-005: transfer and extension require explicit versions and reasons', () => {
  expect(
    stayTransferInputSchema.parse({
      expectedVersion: 1,
      target: manual.target,
      reason: ' Move closer ',
      effectiveAt: '2028-03-01T10:00:00Z',
    }).reason,
  ).toBe('Move closer');
  expect(
    stayExtensionInputSchema.parse({
      expectedVersion: 2,
      expectedLeaveDate: '2028-04-01',
      reason: 'Continue residence',
    }).expectedVersion,
  ).toBe(2);
  expect(
    stayTransferInputSchema.safeParse({ expectedVersion: 0, target: manual.target, reason: 'Move' })
      .success,
  ).toBe(false);
  expect(
    stayExtensionInputSchema.safeParse({
      expectedVersion: 1,
      expectedLeaveDate: '2028-04-01',
      reason: ' ',
    }).success,
  ).toBe(false);
});
it('OUT-001/002: emergency notice requires a reason; normal notice is explicit', () => {
  const notice = { expectedVersion: 1, requestedCheckoutDate: '2028-03-10', isEmergency: false };
  expect(stayNoticeInputSchema.parse(notice).isEmergency).toBe(false);
  expect(stayNoticeInputSchema.safeParse({ ...notice, isEmergency: true }).success).toBe(false);
  expect(
    stayNoticeInputSchema.parse({ ...notice, isEmergency: true, reason: 'Family emergency' })
      .isEmergency,
  ).toBe(true);
});
it('OUT-003/005 / ACC-004: checkout never accepts client balances or paid flags', () => {
  const command = {
    expectedVersion: 3,
    reason: 'Departure confirmed',
    applyAvailableDeposit: true,
  };
  expect(stayCheckoutInputSchema.parse(command)).toEqual(command);
  for (const extra of [{ refundAmountPaisa: 100 }, { paid: true }, { balancePaisa: 0 }])
    expect(stayCheckoutInputSchema.safeParse({ ...command, ...extra }).success).toBe(false);
  expect(
    stayTerminationInputSchema.parse({
      expectedVersion: 3,
      reason: 'Departure recorded',
      kind: 'abandoned',
    }).kind,
  ).toBe('abandoned');
  expect(
    stayAgreementAmendmentInputSchema.parse({
      expectedVersion: 3,
      effectiveFrom: '2028-04-01',
      terms,
      reason: 'New agreed period',
    }).terms,
  ).toEqual(terms);
});
it('RES-004 / PERF: directory uses existing bounded cursor conventions', () => {
  expect(stayDirectoryQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(
    stayDirectoryQuerySchema.parse({
      limit: 1,
      cursor: id,
      state: 'active',
      q: ' Ali ',
      roomId: id,
      bedId: id,
    }).q,
  ).toBe('Ali');
  expect(stayDirectoryQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(stayDirectoryQuerySchema.safeParse({ cursor: 'invalid' }).success).toBe(false);
});
