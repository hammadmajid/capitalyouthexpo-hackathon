import { expect, it } from 'vitest';
import { DomainError } from '@hsm/contracts';
import {
  admissionContext as context,
  admissionIds as ids,
  admissionQuote,
  admissionVersion,
} from '../../test/unit/booking-admission.fixture.js';
import { snapshotBookingAdmissionTerms } from './booking-admission-terms.js';
type Quote = ReturnType<typeof admissionQuote>;
function rejects(action: () => unknown, code: 'INTERNAL' | 'CONFLICT') {
  let failure: unknown;
  try {
    action();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(DomainError);
  expect(failure).toMatchObject({ code, status: code === 'INTERNAL' ? 500 : 409 });
  if (code === 'INTERNAL')
    expect(failure).toHaveProperty('message', 'Booking admission data unavailable');
}
it.each([
  ['platform', null],
  ['hostel', ids.brand],
  ['branch', ids.branch],
  ['room_type', ids.type],
] as const)(
  'BKG-004 / RENT-003: exact %s policy preserves every booked price and original quote',
  (level, scopeId) => {
    const quote = admissionQuote(),
      version = { ...admissionVersion(), level, scopeId };
    const result = snapshotBookingAdmissionTerms(context, quote, version);
    expect(result.bookingSnapshot).toEqual(quote);
    expect(result.terms).toEqual({
      policyVersionId: version.id,
      currency: 'PKR',
      fees: quote.price.fees,
      catalog: [],
      rentAmountPaisa: 1800001,
      depositPaisa: 1000002,
      policy: version.policy,
    });
  },
);
it.each([
  { kind: 'calendar_month', dueDay: 5 },
  { kind: 'anniversary_month', dueOffsetDays: 2 },
])(
  'RENT-003: explicit monthly cycle %# preserves monthly rent and separate monthly fee cadence',
  (cycle) => {
    const version = admissionVersion();
    const result = snapshotBookingAdmissionTerms(context, admissionQuote(), {
      ...version,
      policy: { ...version.policy, cycle },
    });
    expect(result.terms.rentAmountPaisa).toBe(1800001);
    expect(result.terms.policy.cycle).toEqual(cycle);
    expect(result.terms.policy.feeBilling).toEqual(version.policy.feeBilling);
  },
);
it.each([
  { kind: 'week', dueOffsetDays: 0 },
  { kind: 'fixed_period', periodDays: 10, dueOffsetDays: 0 },
  { kind: 'term', dueOffsetDays: 0 },
])('BKG-004: monthly quote cannot silently become selected-cycle rent %#', (cycle) => {
  const version = admissionVersion();
  rejects(
    () =>
      snapshotBookingAdmissionTerms(context, admissionQuote(), {
        ...version,
        policy: { ...version.policy, cycle },
      }),
    'CONFLICT',
  );
});
it.each(['platform', 'hostel', 'branch', 'room_type'] as const)(
  'SEC-003: a foreign or malformed %s producer scope fails as an opaque server fault',
  (level) => {
    const version = { ...admissionVersion(), level, scopeId: ids.other };
    rejects(() => snapshotBookingAdmissionTerms(context, admissionQuote(), version), 'INTERNAL');
  },
);
it('RENT-003: stale requested policy cannot silently accept a different current version', () => {
  rejects(
    () =>
      snapshotBookingAdmissionTerms(
        { ...context, policyVersionId: ids.other },
        admissionQuote(),
        admissionVersion(),
      ),
    'CONFLICT',
  );
});
const mismatches = [
  (quote: Quote) => ({ ...quote, target: { kind: 'room', roomId: ids.room } }),
  (quote: Quote) => ({ ...quote, target: { ...quote.target, roomId: ids.other } }),
  (quote: Quote) => ({ ...quote, target: { kind: 'bed', roomId: ids.room, bedId: ids.other } }),
  (quote: Quote) => ({ ...quote, range: { ...quote.range, moveInDate: '2028-02-02' } }),
  (quote: Quote) => ({ ...quote, range: { ...quote.range, moveOutDate: '2028-03-02' } }),
];
it.each(mismatches)(
  'ACC-001 / BKG-004: original target/range mismatch %# cannot produce an agreement',
  (change) => {
    rejects(
      () => snapshotBookingAdmissionTerms(context, change(admissionQuote()), admissionVersion()),
      'INTERNAL',
    );
  },
);
const corruptQuotes = [
  () => null,
  () => ({ ...admissionQuote(), creatorUserId: ids.other }),
  () => ({ ...admissionQuote(), price: { ...admissionQuote().price, monthlyRentPaisa: 1.5 } }),
  () => ({
    ...admissionQuote(),
    price: { ...admissionQuote().price, monthlyRentPaisa: Number.MAX_SAFE_INTEGER + 1 },
  }),
  () => ({
    ...admissionQuote(),
    price: {
      ...admissionQuote().price,
      fees: [...admissionQuote().price.fees, ...admissionQuote().price.fees],
    },
  }),
  () => ({
    ...admissionQuote(),
    price: {
      ...admissionQuote().price,
      fees: [{ code: 'arbitrary', cadence: 'monthly', amountPaisa: 1 }],
    },
  }),
  () => ({
    ...admissionQuote(),
    price: { ...admissionQuote().price, monthlyRentPaisa: Number.MAX_SAFE_INTEGER },
  }),
  () => ({
    ...admissionQuote(),
    price: {
      ...admissionQuote().price,
      fees: [
        ...admissionQuote().price.fees,
        { code: 'utilities', cadence: 'one_time', amountPaisa: Number.MAX_SAFE_INTEGER },
      ],
    },
  }),
];
it.each(corruptQuotes)(
  'BKG-004 / SEC-003: invalid persisted quote %# is INTERNAL, never a client validation error',
  (value) => {
    rejects(() => snapshotBookingAdmissionTerms(context, value(), admissionVersion()), 'INTERNAL');
  },
);
const corruptContext = [
  () => null,
  () => ({ ...context, ownerUserId: ids.other }),
  () => ({ ...context, branchId: 'invalid' }),
  () => ({ ...context, range: { ...context.range, moveInDate: '0000-02-01' } }),
  () => ({ ...context, range: { moveInDate: '2028-03-01', moveOutDate: '2028-02-01' } }),
  () => ({ ...context, policyVersionId: undefined }),
];
it.each(corruptContext)(
  'SEC-003: invalid authoritative admission context %# fails closed',
  (value) => {
    rejects(
      () => snapshotBookingAdmissionTerms(value(), admissionQuote(), admissionVersion()),
      'INTERNAL',
    );
  },
);
it.each([
  () => null,
  () => ({ ...admissionVersion(), creatorUserId: ids.other }),
  () => ({ ...admissionVersion(), createdAt: 'invalid' }),
  () => ({
    ...admissionVersion(),
    policy: { ...admissionVersion().policy, graceDays: Number.MAX_SAFE_INTEGER + 1 },
  }),
])('RENT-003: malformed authoritative policy %# is opaque INTERNAL', (value) => {
  rejects(() => snapshotBookingAdmissionTerms(context, admissionQuote(), value()), 'INTERNAL');
});
it('FIN-004: required fee timing cannot be inferred from rent', () => {
  const version = admissionVersion(),
    { feeBilling: omitted, ...policy } = version.policy;
  void omitted;
  rejects(
    () => snapshotBookingAdmissionTerms(context, admissionQuote(), { ...version, policy }),
    'CONFLICT',
  );
});
it('FIN-004: configured one-time timing cannot silently stand in for monthly fee timing', () => {
  const version = admissionVersion();
  rejects(
    () =>
      snapshotBookingAdmissionTerms(context, admissionQuote(), {
        ...version,
        policy: { ...version.policy, feeBilling: { oneTimeDueOffsetDays: 2 } },
      }),
    'CONFLICT',
  );
});
it('FIN-004: an explicit zero monthly fee still requires disclosed timing', () => {
  const quote = admissionQuote(),
    version = admissionVersion();
  quote.price.fees = [{ code: 'mess', cadence: 'monthly', amountPaisa: 0 }];
  rejects(
    () =>
      snapshotBookingAdmissionTerms(context, quote, {
        ...version,
        policy: { ...version.policy, feeBilling: { oneTimeDueOffsetDays: 2 } },
      }),
    'CONFLICT',
  );
});
it('FIN-004: one-time-only agreed fees require no invented monthly fee policy', () => {
  const quote = admissionQuote(),
    version = admissionVersion();
  quote.price.fees = quote.price.fees.filter((fee) => fee.cadence === 'one_time');
  const result = snapshotBookingAdmissionTerms(context, quote, {
    ...version,
    policy: { ...version.policy, feeBilling: { oneTimeDueOffsetDays: 2 } },
  });
  expect(result.terms.fees).toEqual(quote.price.fees);
  expect(result.terms.policy.feeBilling?.monthly).toBeUndefined();
});
it.each([0, Number.MAX_SAFE_INTEGER])(
  'RENT-003: exact rent/deposit boundary %s is retained without rounding or inventing charges',
  (amount) => {
    const quote = admissionQuote(),
      version = admissionVersion(),
      { feeBilling: omitted, ...policy } = version.policy;
    void omitted;
    quote.price = { monthlyRentPaisa: amount, depositPaisa: amount, fees: [] };
    const result = snapshotBookingAdmissionTerms(context, quote, { ...version, policy });
    expect(result.terms.rentAmountPaisa).toBe(amount);
    expect(result.terms.depositPaisa).toBe(amount);
    expect(result.terms.fees).toEqual([]);
    expect(result.terms.catalog).toEqual([]);
  },
);
it('BKG-004 / RENT-003: caller mutations cannot rewrite either newly constructed snapshot', () => {
  const quote = admissionQuote(),
    version = admissionVersion();
  const result = snapshotBookingAdmissionTerms(context, quote, version);
  quote.price.monthlyRentPaisa = 1;
  quote.price.fees = [];
  quote.listing.hostelName = 'Changed';
  version.policy.graceDays = 99;
  expect(result.bookingSnapshot.price.monthlyRentPaisa).toBe(1800001);
  expect(result.bookingSnapshot.listing.hostelName).toBe('Original hostel');
  expect(result.terms.rentAmountPaisa).toBe(1800001);
  expect(result.terms.fees).toHaveLength(2);
  expect(result.terms.policy.graceDays).toBe(3);
  result.bookingSnapshot.price.monthlyRentPaisa = 2;
  const firstFee = result.bookingSnapshot.price.fees[0];
  if (!firstFee) throw Error('Expected original disclosed fee');
  firstFee.amountPaisa = 2;
  expect(result.terms.rentAmountPaisa).toBe(1800001);
  expect(result.terms.fees[0]?.amountPaisa).toBe(300003);
});

it('ACC-001 / BKG-004: a whole-room reservation remains a whole-room agreement without inventing a bed', () => {
  const quote = admissionQuote(),
    target = { kind: 'room', roomId: ids.room };
  const result = snapshotBookingAdmissionTerms(
    { ...context, target },
    { ...quote, target, listing: { ...quote.listing, bedLabel: null } },
    admissionVersion(),
  );
  expect(result.bookingSnapshot.target).toEqual(target);
  expect(result.bookingSnapshot.listing.bedLabel).toBeNull();
  expect(result.terms.rentAmountPaisa).toBe(1800001);
});
it('BKG-004: equivalent target property order cannot create a false mismatch', () => {
  const quote = admissionQuote(),
    target = { bedId: ids.bed, roomId: ids.room, kind: 'bed' };
  expect(
    snapshotBookingAdmissionTerms(context, { ...quote, target }, admissionVersion()).bookingSnapshot
      .target,
  ).toEqual(context.target);
});

it('SEC-003 / BKG-004: corrupt stored totals remain INTERNAL even when the requested policy is stale', () => {
  const quote = admissionQuote();
  quote.price.monthlyRentPaisa = Number.MAX_SAFE_INTEGER;
  rejects(
    () =>
      snapshotBookingAdmissionTerms(
        { ...context, policyVersionId: ids.other },
        quote,
        admissionVersion(),
      ),
    'INTERNAL',
  );
});
