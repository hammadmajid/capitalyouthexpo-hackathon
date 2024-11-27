import { admissionSelectionFromDate, billingFormPaisa } from '@hsm/api-client';
import type { z } from 'zod';
import {
  manualAdmissionCommandSchema,
  manualStayInputSchema,
  type billingPolicyVersionSchema,
  type ManualStayInput,
  type roomTypeSummarySchema,
} from '@hsm/contracts';
type BillingPolicyVersion = z.infer<typeof billingPolicyVersionSchema>;
type RoomTypeSummary = z.infer<typeof roomTypeSummarySchema>;
export type ManualAdmissionDraft = {
  cnicPhotoFileId?: string;
  resident: ManualStayInput['resident'];
  roomType: RoomTypeSummary;
  target: ManualStayInput['target'];
  moveInDate: string;
  expectedLeaveDate: string;
  rent: string;
  deposit: string;
  firstRentAmount: string;
};
// RENT-003: a staff-entered first charge applies only under a manual proration policy.
export function manualFirstRent(version: BillingPolicyVersion) {
  return version.policy.proration.kind === 'manual';
}
// STAY-001 / RENT-003: build the exact manual admission command. The room type supplies
// the disclosed fees; staff confirm rent and deposit; every obligation starts on move-in.
export function manualAdmissionCommand(draft: ManualAdmissionDraft, version: BillingPolicyVersion) {
  const manual = {
    resident: draft.resident,
    target: draft.target,
    period: {
      moveInDate: draft.moveInDate,
      expectedLeaveDate: draft.expectedLeaveDate.trim() === '' ? null : draft.expectedLeaveDate,
    },
    terms: {
      policyVersionId: version.id,
      currency: 'PKR' as const,
      policy: version.policy,
      rentAmountPaisa: billingFormPaisa(draft.rent),
      depositPaisa: billingFormPaisa(draft.deposit),
      fees: draft.roomType.fees,
      catalog: [],
    },
  };
  const obligations = [
    {
      item: 'rent' as const,
      cadence: 'periodic' as const,
      manualAmount: manualFirstRent(version) ? draft.firstRentAmount : '',
    },
    ...draft.roomType.fees.map((fee) => ({
      item: fee.code,
      cadence: fee.cadence === 'monthly' ? ('periodic' as const) : ('one_time' as const),
      manualAmount: '',
    })),
  ];
  const parsed = manualStayInputSchema.parse(manual);
  const initialBilling = obligations.map((line) =>
    admissionSelectionFromDate({
      stay: parsed.period,
      terms: parsed.terms,
      item: line.item,
      cadence: line.cadence,
      startsOn: parsed.period.moveInDate,
      manualAmount: line.manualAmount,
    }),
  );
  return manualAdmissionCommandSchema.parse({
    manual: parsed,
    initialBilling,
    ...(draft.resident.kind === 'new' && draft.cnicPhotoFileId
      ? { cnicPhotoFileId: draft.cnicPhotoFileId }
      : {}),
  });
}
// The configured price for the selected option, shown as the editable agreed default.
export function defaultRent(roomType: RoomTypeSummary, target: ManualStayInput['target']) {
  const paisa =
    target.kind === 'bed' ? roomType.bedMonthlyRentPaisa : roomType.roomMonthlyRentPaisa;
  return paisa === null ? '' : String(paisa / 100);
}
