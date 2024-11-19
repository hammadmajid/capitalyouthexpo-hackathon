import { expect, it } from 'vitest';
import { billingCatalogSnapshotsSchema } from './billing-catalog.js';
import { billingAgreementTermsSchema } from './billing-policy.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const row = {
  catalogId: id,
  code: 'laundry',
  name: 'Laundry',
  unitLabel: 'wash',
  unitAmountPaisa: 20001,
};
it('FIN-004 / RENT-003: controlled catalog prices serialize exactly and retain canonical identity', () => {
  expect(billingCatalogSnapshotsSchema.parse([{ ...row, catalogId: id.toUpperCase() }])).toEqual([
    row,
  ]);
});
it.each([
  [{ ...row, unitAmountPaisa: 1.1 }],
  [{ ...row, unitAmountPaisa: 0 }],
  [{ ...row, code: 'arbitrary fee' }],
  [row, row],
  Array.from({ length: 33 }, () => row),
])('FIN-004: invalid or duplicate catalog agreement %j is rejected', (value) => {
  expect(billingCatalogSnapshotsSchema.safeParse(value).success).toBe(false);
});
it('FIN-004: a disabled agreement cannot silently introduce catalog charges', () => {
  const policy = {
    cycle: { kind: 'week', dueOffsetDays: 0 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 7,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: true,
    customCharges: 'disabled',
  };
  const terms = {
    policyVersionId: id,
    currency: 'PKR',
    fees: [],
    catalog: [row],
    rentAmountPaisa: 1800001,
    depositPaisa: 1000001,
    policy,
  };
  expect(billingAgreementTermsSchema.safeParse(terms).success).toBe(false);
  expect(
    billingAgreementTermsSchema.parse({
      ...terms,
      policy: { ...policy, customCharges: 'catalog_only' },
    }).catalog,
  ).toEqual([row]);
});
