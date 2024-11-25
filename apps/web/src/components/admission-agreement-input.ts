import {
  manualStayInputSchema,
  type ManualStayInput,
  type BillingAgreementTerms,
  type BillingCatalogEntry,
  type billingSettingsReadSchema,
} from '@hsm/contracts';
import { billingFormPaisa } from '@hsm/api-client';
import type { z } from 'zod';
import type { AdmissionAgreementDraft } from './admission-agreement-fields';
type Context = {
  resident: ManualStayInput['resident'];
  target: ManualStayInput['target'];
  settings: z.infer<typeof billingSettingsReadSchema>;
  fees: BillingAgreementTerms['fees'];
};
export function admissionAgreementInput(
  context: Context,
  draft: AdmissionAgreementDraft,
  selected: readonly string[],
  catalog: BillingCatalogEntry[],
) {
  const effective = context.settings.effectiveVersion;
  if (!effective) throw Error('Current billing policy required');
  return manualStayInputSchema.parse({
    resident: context.resident,
    target: context.target,
    period: {
      moveInDate: draft.moveInDate,
      expectedLeaveDate: draft.openEnded ? null : draft.expectedLeaveDate,
    },
    terms: {
      policyVersionId: effective.id,
      currency: 'PKR',
      policy: effective.policy,
      rentAmountPaisa: billingFormPaisa(draft.rent),
      depositPaisa: billingFormPaisa(draft.deposit),
      fees: context.fees.filter((fee) => selected.includes(fee.code + ':' + fee.cadence)),
      catalog: catalog
        .filter((row) => selected.includes(row.id))
        .map((row) => ({
          catalogId: row.id,
          code: row.code,
          name: row.name,
          unitLabel: row.unitLabel,
          unitAmountPaisa: row.unitAmountPaisa,
        })),
    },
  });
}
