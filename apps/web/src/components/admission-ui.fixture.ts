import { manualStayInputSchema } from '@hsm/contracts';
export const admissionUiId = '10000000-0000-4000-8000-000000000001';
export const admissionUiOther = '10000000-0000-4000-8000-000000000002';
export function admissionUiManual() {
  return manualStayInputSchema.parse({
    resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
    target: { kind: 'bed', roomId: admissionUiId, bedId: admissionUiId },
    period: { moveInDate: '2028-01-15', expectedLeaveDate: '2028-05-01' },
    terms: {
      policyVersionId: admissionUiId,
      currency: 'PKR',
      fees: [],
      catalog: [],
      rentAmountPaisa: 1800001,
      depositPaisa: 1000001,
      policy: {
        cycle: { kind: 'calendar_month', dueDay: 5 },
        proration: { kind: 'full_period' },
        graceDays: 0,
        lateCharge: { kind: 'disabled' },
        noticeDays: 15,
        earlyCheckout: { kind: 'manual' },
        allowOpenEnded: false,
        customCharges: 'disabled',
      },
    },
  });
}
