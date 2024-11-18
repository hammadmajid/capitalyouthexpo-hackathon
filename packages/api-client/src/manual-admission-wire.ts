import type { ManualAdmissionCommand } from '@hsm/contracts';
import { transportBillingWire } from './billing-settings.js';
import type { paths } from './generated/schema.js';
type Wire =
  paths['/v1/branches/{branchId}/stays/manual']['post']['requestBody']['content']['application/json'];
// Exact optional wire properties are omitted, as in existing billing-policy transport.
export function manualAdmissionWire(input: ManualAdmissionCommand): Wire {
  const reference = input.manual.resident;
  const resident =
    reference.kind === 'existing'
      ? reference
      : {
          kind: 'new' as const,
          profile: {
            displayName: reference.profile.displayName,
            ...(reference.profile.phone === undefined ? {} : { phone: reference.profile.phone }),
            ...(reference.profile.email === undefined ? {} : { email: reference.profile.email }),
            ...(reference.profile.cnic === undefined ? {} : { cnic: reference.profile.cnic }),
          },
        };
  const { feeBilling, agreementTemplate, transportBilling, ...restPolicy } =
    input.manual.terms.policy;
  const requiredPolicy = {
    ...restPolicy,
    ...(agreementTemplate ? { agreementTemplate } : {}),
    ...(transportBilling ? { transportBilling: transportBillingWire(transportBilling) } : {}),
  };
  const policy =
    feeBilling === undefined
      ? requiredPolicy
      : {
          ...requiredPolicy,
          feeBilling: {
            oneTimeDueOffsetDays: feeBilling.oneTimeDueOffsetDays,
            ...(feeBilling.monthly === undefined ? {} : { monthly: feeBilling.monthly }),
          },
        };
  return {
    ...(input.cnicPhotoFileId === undefined ? {} : { cnicPhotoFileId: input.cnicPhotoFileId }),
    manual: { ...input.manual, resident, terms: { ...input.manual.terms, policy } },
    initialBilling: input.initialBilling.map(({ manualAmountPaisa, ...selection }) => ({
      ...selection,
      ...(manualAmountPaisa === undefined ? {} : { manualAmountPaisa }),
    })),
  };
}
