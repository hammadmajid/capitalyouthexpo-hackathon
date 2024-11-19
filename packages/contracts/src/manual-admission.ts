import { z } from 'zod';
import { manualStayInputSchema } from './stay-commands.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema } from './stay-values.js';
import type { BillingAgreementTerms } from './billing-policy.js';
export const admissionBillingSelectionSchema = z
  .object({
    item: z.enum(['rent', 'mess', 'utilities', 'admission']),
    cadence: z.enum(['periodic', 'one_time']),
    periodIndex: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    manualAmountPaisa: moneyJsonSchema.optional(),
  })
  .strict();
export type AdmissionBillingSelection = z.infer<typeof admissionBillingSelectionSchema>;
function key(value: { item: string; cadence: string }) {
  return value.item + ':' + value.cadence;
}
// STAY-001 / RENT-003/004: one explicit start per original disclosed obligation;
// no inferred historic arrears, duplicated starting periods or undisclosed fees.
export function hasCompleteAdmissionSelection(
  terms: Pick<BillingAgreementTerms, 'fees'>,
  selections: readonly AdmissionBillingSelection[],
) {
  const required = new Set([
    'rent:periodic',
    ...terms.fees.map((fee) =>
      key({ item: fee.code, cadence: fee.cadence === 'monthly' ? 'periodic' : 'one_time' }),
    ),
  ]);
  const selected = new Set(selections.map(key));
  return (
    selected.size === selections.length &&
    selected.size === required.size &&
    [...selected].every((value) => required.has(value))
  );
}
export const manualAdmissionCommandSchema = z
  .object({
    manual: manualStayInputSchema,
    cnicPhotoFileId: stayIdentifierSchema.optional(),
    initialBilling: z.array(admissionBillingSelectionSchema).min(1).max(33),
  })
  .strict()
  .refine((value) => !value.cnicPhotoFileId || value.manual.resident.kind === 'new', {
    path: ['cnicPhotoFileId'],
    message: 'CNIC photos belong to a new resident admission',
  })
  .refine(
    (value) => hasCompleteAdmissionSelection(value.manual.terms, value.initialBilling),
    'Select exactly rent and every disclosed fee starting period',
  );
export type ManualAdmissionCommand = z.infer<typeof manualAdmissionCommandSchema>;
export const manualAdmissionResultSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    residentId: stayIdentifierSchema,
    agreementId: stayIdentifierSchema,
    assignmentId: stayIdentifierSchema,
    state: z.literal('active'),
    version: z.literal(1),
  })
  .strict();
export type ManualAdmissionResult = z.infer<typeof manualAdmissionResultSchema>;
