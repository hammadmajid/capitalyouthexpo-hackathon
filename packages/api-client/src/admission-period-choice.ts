import {
  admissionBillingSelectionSchema,
  databaseDateSchema,
  planRentPeriod,
  planAgreedFeePeriod,
  type ManualStayInput,
  type BillingAgreementTerms,
  type AdmissionBillingSelection,
} from '@hsm/contracts';
import { billingFormPaisa } from './billing-form-money.js';
type Choice = {
  stay: ManualStayInput['period'];
  terms: BillingAgreementTerms;
  item: AdmissionBillingSelection['item'];
  cadence: AdmissionBillingSelection['cadence'];
  startsOn: string;
  manualAmount: string;
};
function unavailable(): never {
  throw Error('Choose a valid billing period start from the agreed Stay.');
}
function selectedCycle(choice: Choice) {
  const cycle =
    choice.item === 'rent'
      ? choice.terms.policy.cycle
      : choice.terms.policy.feeBilling?.monthly?.cycle;
  if (!cycle) throw Error('Configure explicit monthly fee timing before admission.');
  return cycle;
}
function selectedIndex(choice: Choice, selected: string) {
  const start = choice.stay.moveInDate;
  if (selected < start) unavailable();
  if (choice.cadence === 'one_time') return 0;
  const cycle = selectedCycle(choice);
  if (cycle.kind === 'term') return 0;
  if (cycle.kind === 'calendar_month' || cycle.kind === 'anniversary_month')
    return (
      (Number(selected.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(selected.slice(5, 7)) -
      Number(start.slice(5, 7))
    );
  const days =
    (Date.parse(selected + 'T00:00:00.000Z') - Date.parse(start + 'T00:00:00.000Z')) / 86400000;
  return Math.floor(days / (cycle.kind === 'week' ? 7 : cycle.periodDays));
}
// UI-only lookup: user chooses an explicit calendar date; canonical planners
// validate that date and compute charges. Server time/authority remain decisive.
export function previewAdmissionPeriodFromDate(choice: Choice) {
  const selected = databaseDateSchema.parse(choice.startsOn);
  if (choice.item === 'rent' && choice.cadence !== 'periodic') unavailable();
  const selection = admissionBillingSelectionSchema.parse({
    item: choice.item,
    cadence: choice.cadence,
    periodIndex: selectedIndex(choice, selected),
    ...(choice.manualAmount.trim() === ''
      ? {}
      : { manualAmountPaisa: billingFormPaisa(choice.manualAmount) }),
  });
  const common = {
    stay: choice.stay,
    terms: choice.terms,
    periodIndex: selection.periodIndex,
    ...(selection.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: selection.manualAmountPaisa }),
  };
  const period =
    choice.item === 'rent'
      ? planRentPeriod(common)
      : planAgreedFeePeriod({
          ...common,
          fee: {
            code: choice.item,
            cadence: choice.cadence === 'periodic' ? 'monthly' : 'one_time',
          },
        });
  if (!period || (period.periodStart ?? choice.stay.moveInDate) !== selected) unavailable();
  return { selection, period };
}
export function admissionSelectionFromDate(choice: Choice) {
  const { selection, period } = previewAdmissionPeriodFromDate(choice);
  if (period.amountPaisa === null)
    throw Error('Enter the agreed amount for this partial billing period.');
  return selection;
}
