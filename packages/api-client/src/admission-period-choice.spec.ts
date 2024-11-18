import { expect, it } from 'vitest';
import { manualStayInputSchema, type BillingPolicy } from '@hsm/contracts';
import {
  admissionSelectionFromDate,
  previewAdmissionPeriodFromDate,
} from './admission-period-choice.js';
const id = '10000000-0000-4000-8000-000000000001';
const policy: BillingPolicy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
};
function manual(patch: Partial<BillingPolicy> = {}, start = '2028-01-15', end = '2028-05-01') {
  return manualStayInputSchema.parse({
    resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
    target: { kind: 'bed', roomId: id, bedId: id },
    period: { moveInDate: start, expectedLeaveDate: end },
    terms: {
      policyVersionId: id,
      currency: 'PKR',
      fees: [],
      catalog: [],
      rentAmountPaisa: 1800001,
      depositPaisa: 1000001,
      policy: { ...policy, ...patch },
    },
  });
}
function choice(value = manual(), startsOn = value.period.moveInDate) {
  return {
    stay: value.period,
    terms: value.terms,
    item: 'rent' as const,
    cadence: 'periodic' as const,
    startsOn,
    manualAmount: '',
  };
}
it.each([
  {
    cycle: { kind: 'calendar_month', dueDay: 5 } as const,
    start: '2028-01-15',
    selected: '2028-02-01',
    index: 1,
  },
  {
    cycle: { kind: 'anniversary_month', dueOffsetDays: 0 } as const,
    start: '2028-01-31',
    selected: '2028-02-29',
    index: 1,
  },
  {
    cycle: { kind: 'week', dueOffsetDays: 0 } as const,
    start: '2028-01-15',
    selected: '2028-01-29',
    index: 2,
  },
  {
    cycle: { kind: 'fixed_period', periodDays: 10, dueOffsetDays: 0 } as const,
    start: '2028-01-15',
    selected: '2028-02-04',
    index: 2,
  },
  {
    cycle: { kind: 'term', dueOffsetDays: 0 } as const,
    start: '2028-01-15',
    selected: '2028-01-15',
    index: 0,
  },
])(
  'RENT-003: explicit date resolves canonical %s cycle without advancing or changing amounts',
  ({ cycle, start, selected, index }) => {
    const value = manual({ cycle }, start),
      before = structuredClone(value);
    expect(admissionSelectionFromDate(choice(value, selected))).toEqual({
      item: 'rent',
      cadence: 'periodic',
      periodIndex: index,
    });
    expect(value).toEqual(before);
  },
);
it('RENT-003: first calendar partial period begins at the agreed move-in date', () => {
  expect(admissionSelectionFromDate(choice())).toEqual({
    item: 'rent',
    cadence: 'periodic',
    periodIndex: 0,
  });
});
it('FIN-004: independent monthly fee calendar is not taken from weekly rent', () => {
  const value = manual({
    cycle: { kind: 'week', dueOffsetDays: 0 },
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 10 },
        proration: { kind: 'full_period' },
      },
    },
  });
  value.terms.fees = [{ code: 'mess', cadence: 'monthly', amountPaisa: 501 }];
  expect(admissionSelectionFromDate({ ...choice(value, '2028-02-01'), item: 'mess' })).toEqual({
    item: 'mess',
    cadence: 'periodic',
    periodIndex: 1,
  });
  expect(admissionSelectionFromDate(choice(value, '2028-01-29')).periodIndex).toBe(2);
});
it('FIN-004: explicitly configured anniversary-month fee uses its own anchor', () => {
  const value = manual({
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 0 },
        proration: { kind: 'full_period' },
      },
    },
  });
  value.terms.fees = [{ code: 'utilities', cadence: 'monthly', amountPaisa: 501 }];
  expect(
    admissionSelectionFromDate({ ...choice(value, '2028-02-15'), item: 'utilities' }).periodIndex,
  ).toBe(1);
});
it('FIN-004: one-time disclosed fee has exactly its original Stay start', () => {
  const value = manual({ feeBilling: { oneTimeDueOffsetDays: 5 } });
  value.terms.fees = [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }];
  const input = { ...choice(value), item: 'admission' as const, cadence: 'one_time' as const };
  expect(admissionSelectionFromDate(input)).toEqual({
    item: 'admission',
    cadence: 'one_time',
    periodIndex: 0,
  });
  expect(() => admissionSelectionFromDate({ ...input, startsOn: '2028-02-01' })).toThrow(
    'Choose a valid billing period',
  );
});
it('RENT-003: zero is an explicit authorized partial amount, never an empty default', () => {
  const input = choice(manual({ proration: { kind: 'manual' } }));
  expect(() => admissionSelectionFromDate(input)).toThrow('Enter the agreed amount');
  expect(admissionSelectionFromDate({ ...input, manualAmount: '0.00' }).manualAmountPaisa).toBe(0);
});
it('RENT-003: an amount cannot turn a full month into a manual partial period', () => {
  const input = choice(manual({ proration: { kind: 'manual' } }, '2028-01-01'));
  expect(() => admissionSelectionFromDate({ ...input, manualAmount: '0' })).toThrow(
    'Manual amount is only valid',
  );
});
it.each(['0.001', '-1', '900719925474099.99'])(
  'FIN-001: inexact or unsafe explicit PKR amount %s rejects',
  (manualAmount) => {
    expect(() =>
      admissionSelectionFromDate({
        ...choice(manual({ proration: { kind: 'manual' } })),
        manualAmount,
      }),
    ).toThrow();
  },
);
it.each(['2027-12-31', '2028-02-30', '2028-06-01'])(
  'RENT-003: invalid, pre-agreement or exhausted date %s cannot silently clamp',
  (startsOn) => {
    expect(() => admissionSelectionFromDate(choice(manual(), startsOn))).toThrow();
  },
);
it('RENT-003: weekly date off the agreed anchor cannot select its preceding period', () => {
  expect(() =>
    admissionSelectionFromDate(
      choice(manual({ cycle: { kind: 'week', dueOffsetDays: 0 } }), '2028-01-16'),
    ),
  ).toThrow('Choose a valid billing period');
});
it('RENT-003: clamped leap-month anniversary rejects the wrong adjacent day', () => {
  expect(() =>
    admissionSelectionFromDate(
      choice(
        manual({ cycle: { kind: 'anniversary_month', dueOffsetDays: 0 } }, '2028-01-31'),
        '2028-02-28',
      ),
    ),
  ).toThrow('Choose a valid billing period');
});
it('FIN-004: omitted fee timing and undisclosed fee remain unconfigured', () => {
  const input = { ...choice(), item: 'mess' as const };
  expect(() => admissionSelectionFromDate(input)).toThrow('Configure explicit monthly fee timing');
  const value = manual({
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 10 },
        proration: { kind: 'full_period' },
      },
    },
  });
  expect(() =>
    admissionSelectionFromDate({ ...input, stay: value.period, terms: value.terms }),
  ).toThrow();
});
it('SEC-003: rent cannot use a one-time disclosed-fee cursor', () => {
  expect(() => admissionSelectionFromDate({ ...choice(), cadence: 'one_time' })).toThrow(
    'Choose a valid billing period',
  );
});

it('RENT-003: preview exposes an unresolved partial amount without guessing a charge', () => {
  const input = choice(manual({ proration: { kind: 'manual' } }));
  expect(previewAdmissionPeriodFromDate(input).period.amountPaisa).toBeNull();
  expect(previewAdmissionPeriodFromDate({ ...input, manualAmount: '0' }).period.amountPaisa).toBe(
    0n,
  );
  expect(() => admissionSelectionFromDate(input)).toThrow('Enter the agreed amount');
});
