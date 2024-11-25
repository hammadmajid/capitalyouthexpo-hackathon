import { expect, it } from 'vitest';
import { parsePolicyForm, policyFormValues } from './booking-policy-form';
const values = {
  bookingMode: 'request',
  holdSeconds: '600',
  requestExpirySeconds: '3600',
  requestReservesInventory: 'true',
  minimumStayDays: '1',
  maximumStayDays: '365',
  minimumAdvanceDays: '0',
  maximumAdvanceDays: '90',
  customerSelectsInventory: 'false',
  cancellationAllowed: 'true',
  cancellationCutoffHours: '24',
  allowedStayUnits: 'day,week',
  allowEvidenceReuse: 'true',
  documentReviewRequired: 'false',
  requiredDocuments: '',
};
const limits = {
  maximumHoldSeconds: '3600',
  maximumActiveHolds: '3',
  maximumRequestExpirySeconds: '86400',
  maximumAdvanceDays: '365',
  maximumFiniteStayDays: '730',
};
it('BKG-006: saved values preserve false, zero, arrays and inherited null', () => {
  expect(
    policyFormValues({
      holdSeconds: 0,
      documentReviewRequired: false,
      requiredDocuments: [],
      allowedStayUnits: ['day', 'week'],
      bookingMode: null,
      maximumStayDays: undefined,
    }),
  ).toEqual({
    holdSeconds: '0',
    documentReviewRequired: 'false',
    requiredDocuments: '',
    allowedStayUnits: 'day,week',
    bookingMode: '',
    maximumStayDays: '',
  });
  expect(policyFormValues(null)).toEqual({});
  expect(policyFormValues('invalid')).toEqual({});
});
it('BKG-006: Root values require explicit complete defaults and numeric limits', () => {
  expect(parsePolicyForm(values, true, limits)).toMatchObject({
    policy: {
      customerSelectsInventory: false,
      minimumAdvanceDays: 0,
      requiredDocuments: [],
      allowedStayUnits: ['day', 'week'],
    },
    limits: { maximumActiveHolds: 3 },
  });
  expect(() => parsePolicyForm({}, true, {})).toThrow();
  expect(() => parsePolicyForm(values, true, { ...limits, maximumActiveHolds: '' })).toThrow();
});
it('CHG-007: missing/null overrides inherit while empty document lists remain explicit', () => {
  expect(parsePolicyForm({}, false, {})).toMatchObject({
    overrides: {
      holdSeconds: null,
      bookingMode: null,
      requiredDocuments: null,
      allowedStayUnits: null,
    },
  });
  expect(
    parsePolicyForm(
      {
        requiredDocuments: '',
        allowedStayUnits: 'inherit',
        maximumStayDays: 'unlimited',
        cancellationAllowed: 'false',
      },
      false,
      {},
    ),
  ).toMatchObject({
    overrides: {
      requiredDocuments: [],
      allowedStayUnits: null,
      maximumStayDays: 'unlimited',
      cancellationAllowed: false,
    },
  });
});
it('CHG-007: required document and stay-unit lists are restricted to the approved catalog', () => {
  expect(
    parsePolicyForm({ requiredDocuments: 'cnic,student_id', allowedStayUnits: 'month' }, false, {}),
  ).toMatchObject({
    overrides: { requiredDocuments: ['cnic', 'student_id'], allowedStayUnits: ['month'] },
  });
  expect(() => parsePolicyForm({ requiredDocuments: 'private_record' }, false, {})).toThrow();
  expect(() => parsePolicyForm({ allowedStayUnits: '' }, false, {})).toThrow();
  expect(() => parsePolicyForm({ allowedStayUnits: 'day,day' }, false, {})).toThrow();
});
it.each(['-1', '1.5', 'NaN', '9007199254740993', '2147483648', '1e3'])(
  'BKG-006: unsafe numeric value %s is rejected',
  (holdSeconds) => {
    expect(() => parsePolicyForm({ holdSeconds }, false, {})).toThrow();
  },
);
it('BKG-006: explicit unlimited is accepted and invalid complete ranges fail closed', () => {
  expect(parsePolicyForm({ ...values, maximumStayDays: 'unlimited' }, true, limits)).toMatchObject({
    policy: { maximumStayDays: 'unlimited' },
  });
  expect(() => parsePolicyForm({ ...values, minimumStayDays: '366' }, true, limits)).toThrow();
  expect(() => parsePolicyForm({ ...values, bookingMode: 'guess' }, true, limits)).toThrow();
});

it('CHG-007: saved null document overrides stay inherited when reopened', () => {
  const form = policyFormValues({ requiredDocuments: null, allowedStayUnits: null });
  expect(parsePolicyForm(form, false, {})).toMatchObject({
    overrides: { requiredDocuments: null, allowedStayUnits: null },
  });
});
