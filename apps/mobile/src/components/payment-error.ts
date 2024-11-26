import { ApiFailure } from '@hsm/api-client';
import { safeMessage } from '../lib/messages';
const fields: Record<string, string> = {
  amountPaisa: 'amount',
  method: 'payment method',
  paidOn: 'date',
  note: 'note',
  allocations: 'bills',
  depositPaisa: 'deposit',
  advanceCreditPaisa: 'advance',
  transactionReference: 'reference',
  proofFileId: 'proof',
};
// PAY-008: a failed save says what went wrong in words the recorder can act on.
export function paymentErrorMessage(error: unknown): string {
  if (!(error instanceof ApiFailure)) return safeMessage(error);
  const { code, detail, errors } = error.problem;
  if (code === 'VALIDATION_FAILED' && errors?.length) {
    const names = [...new Set(errors.map((row) => fields[row.path.split('.')[0] ?? ''] ?? null))]
      .filter(Boolean)
      .join(', ');
    return names ? 'Please check: ' + names : safeMessage(error);
  }
  if (code === 'CONFLICT') {
    if (/exceeds invoice outstanding/i.test(detail))
      return 'A bill now owes less than before. Go back, reopen the payment and try again.';
    if (/account link changed/i.test(detail))
      return "This resident's account changed. Go back and open the payment again.";
    if (/already recorded/i.test(detail)) return 'This payment was already saved.';
  }
  if (code === 'NOT_FOUND')
    return 'This stay or bill is no longer available. Go back and reopen it.';
  if (code === 'FORBIDDEN' || code === 'BRANCH_FORBIDDEN')
    return 'You cannot record payments for this branch.';
  return safeMessage(error);
}
