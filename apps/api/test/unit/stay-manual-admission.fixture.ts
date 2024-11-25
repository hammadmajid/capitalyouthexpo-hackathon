import { randomUUID } from 'node:crypto';
import { manualAdmissionCommandSchema } from '@hsm/contracts';
import { paymentIds, paymentAuthority } from './stay-payment.fixture.js';
export const admissionIds = {
  ...paymentIds,
  resident: randomUUID(),
  agreement: randomUUID(),
  assignment: randomUUID(),
  room: randomUUID(),
  bed: randomUUID(),
  policy: randomUUID(),
};
export const admissionCommand = manualAdmissionCommandSchema.parse({
  manual: {
    resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
    target: { kind: 'bed', roomId: admissionIds.room, bedId: admissionIds.bed },
    period: { moveInDate: '2026-10-20', expectedLeaveDate: '2026-11-20' },
    terms: {
      policyVersionId: admissionIds.policy,
      currency: 'PKR',
      rentAmountPaisa: 1800001,
      depositPaisa: 1000001,
      fees: [],
      catalog: [],
      policy: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 0 },
        proration: { kind: 'full_period' },
        graceDays: 0,
        lateCharge: { kind: 'disabled' },
        noticeDays: 15,
        earlyCheckout: { kind: 'manual' },
        allowOpenEnded: false,
        customCharges: 'disabled',
      },
    },
  },
  initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
});
export const admissionResult = {
  branchId: admissionIds.branch,
  stayId: admissionIds.stay,
  residentId: admissionIds.resident,
  agreementId: admissionIds.agreement,
  assignmentId: admissionIds.assignment,
  state: 'active' as const,
  version: 1 as const,
};
export const admissionAuthority = { ...paymentAuthority, userId: null as string | null };
