import { expect, it } from 'vitest';
import { requireAdmissionStartingPeriods } from '../src/resident-admission-starts.js';
import { admissionInput } from './resident-manual-admission.fixture.js';
type Input = Parameters<typeof requireAdmissionStartingPeriods>[0];
const base: Input = {
  period: admissionInput.manual.period,
  terms: admissionInput.manual.terms,
  selections: admissionInput.initialBilling,
};
const today = '2028-02-01';
it('RENT-003: valid explicitly selected current start remains unchanged', () => {
  const before = structuredClone(base);
  expect(() => requireAdmissionStartingPeriods(base, today)).not.toThrow();
  expect(base).toEqual(before);
});
it('RENT-003: explicitly selected historical arrears are retained without guessing or advancing the cursor', () => {
  const value: Input = { ...base, period: { ...base.period, moveInDate: '2028-01-01' } };
  const before = structuredClone(value);
  expect(() => requireAdmissionStartingPeriods(value, today)).not.toThrow();
  expect(value).toEqual(before);
});
it('RENT-003: explicit zero rent remains zero instead of becoming a fabricated payment or an invalid period', () => {
  const value: Input = { ...base, terms: { ...base.terms, rentAmountPaisa: 0 } };
  expect(() => requireAdmissionStartingPeriods(value, today)).not.toThrow();
  expect(value.terms.rentAmountPaisa).toBe(0);
});
it.each([
  { end: '2028-06-01', index: 1 },
  { end: '2028-03-01', index: 1 },
])('RENT-003 / FIN-004: future or exhausted rent selection %# is unavailable', ({ end, index }) => {
  const value: Input = {
    ...base,
    period: { ...base.period, expectedLeaveDate: end },
    selections: [{ item: 'rent', cadence: 'periodic', periodIndex: index }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).toThrowError(
    'Select an initial billing period',
  );
});
it('FIN-004: valid one-time obligation starts at its only actual period', () => {
  const value: Input = {
    ...base,
    terms: {
      ...base.terms,
      fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
      policy: { ...base.terms.policy, feeBilling: { oneTimeDueOffsetDays: 0 } },
    },
    selections: [...base.selections, { item: 'admission', cadence: 'one_time', periodIndex: 0 }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).not.toThrow();
});
it('FIN-004: one-time cursor beyond zero cannot erase the disclosed obligation', () => {
  const value: Input = {
    ...base,
    terms: {
      ...base.terms,
      fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
      policy: { ...base.terms.policy, feeBilling: { oneTimeDueOffsetDays: 0 } },
    },
    selections: [...base.selections, { item: 'admission', cadence: 'one_time', periodIndex: 1 }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).toThrowError(
    'Select an initial billing period',
  );
});
it('RENT-003 / FIN-004: independent weekly rent and monthly fee starts reuse their own canonical calendars', () => {
  const value: Input = {
    period: { ...base.period, moveInDate: '2028-01-01' },
    terms: {
      ...base.terms,
      fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 501 }],
      policy: {
        ...base.terms.policy,
        cycle: { kind: 'week', dueOffsetDays: 0 },
        feeBilling: {
          oneTimeDueOffsetDays: 0,
          monthly: {
            cycle: { kind: 'calendar_month', dueDay: 10 },
            proration: { kind: 'full_period' },
          },
        },
      },
    },
    selections: [
      { item: 'rent', cadence: 'periodic', periodIndex: 4 },
      { item: 'mess', cadence: 'periodic', periodIndex: 1 },
    ],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).not.toThrow();
  expect(value.selections.map((selection) => selection.periodIndex)).toEqual([4, 1]);
});
it.each([
  { end: '2028-06-01', index: 1 },
  { end: '2028-03-01', index: 1 },
])('FIN-004: future/exhausted independent monthly fee %# cannot be skipped', ({ end, index }) => {
  const value: Input = {
    ...base,
    period: { ...base.period, expectedLeaveDate: end },
    terms: {
      ...base.terms,
      fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 501 }],
      policy: {
        ...base.terms.policy,
        feeBilling: {
          oneTimeDueOffsetDays: 0,
          monthly: {
            cycle: { kind: 'calendar_month', dueDay: 10 },
            proration: { kind: 'full_period' },
          },
        },
      },
    },
    selections: [...base.selections, { item: 'mess', cadence: 'periodic', periodIndex: index }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).toThrowError(
    'Select an initial billing period',
  );
});
it('RENT-003: an explicit manual zero partial amount remains an explicit choice', () => {
  const value: Input = {
    ...base,
    period: { ...base.period, moveInDate: '2028-01-15' },
    terms: { ...base.terms, policy: { ...base.terms.policy, proration: { kind: 'manual' } } },
    selections: [{ item: 'rent', cadence: 'periodic', periodIndex: 0, manualAmountPaisa: 0 }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).not.toThrow();
  expect(value.selections[0]?.manualAmountPaisa).toBe(0);
});
it('FIN-004: missing explicit fee timing retains the canonical validation error', () => {
  const value: Input = {
    ...base,
    terms: { ...base.terms, fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }] },
    selections: [...base.selections, { item: 'admission', cadence: 'one_time', periodIndex: 0 }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).toThrowError(
    'Explicit fee billing policy required',
  );
});
it('RENT-003: unsupported upper-calendar cursor fails without clamping or silently exhausting an open-ended Stay', () => {
  const value: Input = {
    ...base,
    period: { ...base.period, expectedLeaveDate: null },
    terms: { ...base.terms, policy: { ...base.terms.policy, allowOpenEnded: true } },
    selections: [{ item: 'rent', cadence: 'periodic', periodIndex: Number.MAX_SAFE_INTEGER - 1 }],
  };
  expect(() => requireAdmissionStartingPeriods(value, today)).toThrowError(
    'Select an initial billing period',
  );
});
it('SEC-003: invalid authoritative admission date cannot validate a starting period', () => {
  expect(() => requireAdmissionStartingPeriods(base, '2028-02-30')).toThrow();
});
