import type { z } from 'zod';
import {
  databaseDateSchema,
  DomainError,
  planRentPeriod,
  planAgreedFeePeriod,
  type BillingAgreementTerms,
  type ManualStayInput,
} from '@hsm/contracts';
import type { selectionSchema } from './resident-admission-billing.js';
type Selection = z.infer<typeof selectionSchema>;
type Input = {
  period: ManualStayInput['period'];
  terms: BillingAgreementTerms;
  selections: readonly Selection[];
};
function unavailable(): never {
  throw new DomainError(
    'CONFLICT',
    409,
    'Select an initial billing period that has begun and belongs to the agreed Stay',
  );
}
function selectedPeriod(input: Input, selection: Selection) {
  const common = {
    stay: input.period,
    terms: input.terms,
    periodIndex: selection.periodIndex,
    ...(selection.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: selection.manualAmountPaisa }),
  };
  try {
    return selection.item === 'rent'
      ? planRentPeriod(common)
      : planAgreedFeePeriod({
          ...common,
          fee: {
            code: selection.item,
            cadence: selection.cadence === 'periodic' ? 'monthly' : 'one_time',
          },
        });
  } catch (error) {
    if (error instanceof RangeError) unavailable();
    throw error;
  }
}
// STAY-001 / RENT-003/004 / FIN-004: explicit historic starts are allowed; a
// future/exhausted cursor must not omit a mandatory initial obligation. Reuse the
// canonical rent/independent-fee planners; never clamp a date or invent arrears.
export function requireAdmissionStartingPeriods(input: Input, admittedOn: string) {
  const today = databaseDateSchema.parse(admittedOn);
  for (const selection of input.selections) {
    const period = selectedPeriod(input, selection);
    if (!period || (period.periodStart !== null && period.periodStart > today)) unavailable();
  }
}
