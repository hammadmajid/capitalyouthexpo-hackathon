import { billingAgreementTermsSchema } from '@hsm/contracts';
import {
  rentAgreement,
  rentCharge,
  rentQueryFixture,
  rentTerms,
  rentCommand,
} from './resident-rent.fixture.js';
export const feeTerms = billingAgreementTermsSchema.parse({
  ...rentTerms,
  fees: [
    { code: 'mess', cadence: 'monthly', amountPaisa: 3101 },
    { code: 'utilities', cadence: 'one_time', amountPaisa: 777 },
  ],
  policy: {
    ...rentTerms.policy,
    cycle: { kind: 'week', dueOffsetDays: 2 },
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 7 },
        proration: { kind: 'calendar_days', rounding: 'half_up' },
      },
    },
  },
});
export const feeCommand = { ...rentCommand, fee: { code: 'mess', cadence: 'monthly' } };
export const oneTimeCommand = { ...rentCommand, fee: { code: 'utilities', cadence: 'one_time' } };
export function feeAgreement(patch: Parameters<typeof rentAgreement>[0] = {}) {
  return rentAgreement({ termsSnapshot: feeTerms, ...patch });
}
export function feeCharge(patch: Parameters<typeof rentCharge>[0] = {}) {
  return rentCharge({
    kind: 'mess',
    sourceKey: 'fee:mess:monthly:2028-02-01:2028-03-01',
    amountPaisa: 3101n,
    ...patch,
  });
}
export function feeQueryFixture(options: Parameters<typeof rentQueryFixture>[0] = {}) {
  return rentQueryFixture({ agreement: [feeAgreement()], ...options });
}
