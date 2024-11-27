import { formatDate, planRentPeriod, type BillingAgreementTerms } from '@hsm/contracts';

// RENT-003: display the agreed planner's next rent date, including periods not yet invoiced.
// This is a preview only; it never creates a bill or changes its due date.
export function nextRentLabel(input: {
  terms: BillingAgreementTerms | undefined;
  moveInDate: string;
  expectedLeaveDate: string | null;
  closed: boolean;
  state: string;
  asOf: string;
}) {
  if (input.closed) return 'Stay ended';
  if (input.state === 'checkout_pending') return 'On checkout';
  if (!input.terms) return 'Unavailable';
  try {
    const stay = { moveInDate: input.moveInDate, expectedLeaveDate: input.expectedLeaveDate };
    const period = (index: number) =>
      planRentPeriod({ stay, terms: input.terms, periodIndex: index });
    const elapsed = Math.max(
      0,
      Math.floor((Date.parse(input.asOf) - Date.parse(input.moveInDate)) / 86400000),
    );
    let low = 0,
      high = elapsed + 2;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = period(middle);
      if (!candidate || candidate.dueDate > input.asOf) high = middle;
      else low = middle + 1;
    }
    const next = period(low);
    return next
      ? formatDate(next.dueDate + 'T00:00:00Z')
      : input.expectedLeaveDate
        ? 'On checkout'
        : 'No further rent';
  } catch {
    return 'Unavailable';
  }
}
