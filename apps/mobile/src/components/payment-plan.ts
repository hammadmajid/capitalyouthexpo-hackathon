import { billingFormPaisa } from '@hsm/api-client';
import { databaseDateSchema, type RecordExternalPaymentInput } from '@hsm/contracts';
export type OpenBill = {
  invoiceId: string;
  dueDate: string;
  outstandingPaisa: number;
  overdue: boolean;
  label?: string | undefined;
};
export type PaymentPlan = {
  allocations: { invoiceId: string; amountPaisa: number }[];
  advancePaisa: number;
  remainingPaisa: number;
};
// PAY-008 / FIN-001: money after the deposit pays the chosen bills oldest first; less
// than owed leaves a remaining balance (partial payment), more is kept as advance credit.
// Integer paisa throughout (bigint), so every received paisa is accounted for.
export function planPayment(
  amountPaisa: number,
  depositPaisa: number,
  bills: readonly OpenBill[],
): PaymentPlan {
  let left = BigInt(amountPaisa) - BigInt(depositPaisa);
  const allocations: PaymentPlan['allocations'] = [];
  let owed = 0n;
  for (const bill of [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const due = BigInt(bill.outstandingPaisa);
    owed += due;
    const pay = left < due ? left : due;
    if (pay > 0n) {
      allocations.push({ invoiceId: bill.invoiceId, amountPaisa: Number(pay) });
      left -= pay;
    }
  }
  const paid = allocations.reduce((sum, row) => sum + BigInt(row.amountPaisa), 0n);
  return {
    allocations,
    advancePaisa: Number(left > 0n ? left : 0n),
    remainingPaisa: Number(owed - paid),
  };
}
export type PaymentEntry = {
  amount: string;
  deposit: string;
  method: string;
  paidOn: string;
  note: string;
  transactionReference: string;
};
function money(value: string): number | undefined {
  try {
    return billingFormPaisa(value.trim() || 'x');
  } catch {
    return undefined;
  }
}
// Every problem in words the recorder can act on, checked before the review step.
export function paymentProblems(entry: PaymentEntry, proofPending: boolean): string[] {
  const problems: string[] = [];
  const amount = money(entry.amount);
  const deposit = entry.deposit.trim() ? money(entry.deposit) : 0;
  if (amount === undefined || amount <= 0) problems.push('Enter the amount received');
  if (!entry.method) problems.push('Choose how it was paid');
  if (!databaseDateSchema.safeParse(entry.paidOn).success)
    problems.push('Date must look like 2026-11-14');
  if (deposit === undefined) problems.push('Deposit must be an amount like 5000');
  else if (amount !== undefined && deposit > amount)
    problems.push('Deposit is more than the amount received');
  if (entry.note.length > 500) problems.push('Note is too long');
  if (entry.transactionReference.length > 160) problems.push('Reference is too long');
  if (proofPending) problems.push('Wait for the proof to finish uploading');
  return problems;
}
export function paymentCommand(
  entry: PaymentEntry,
  bills: readonly OpenBill[],
  proofFileId: string | undefined,
): { command: RecordExternalPaymentInput; plan: PaymentPlan } | undefined {
  const amount = money(entry.amount);
  const deposit = entry.deposit.trim() ? money(entry.deposit) : 0;
  if (amount === undefined || deposit === undefined || deposit > amount) return undefined;
  const plan = planPayment(amount, deposit, bills);
  const reference = entry.transactionReference.trim();
  return {
    plan,
    command: {
      amountPaisa: amount,
      method: entry.method as RecordExternalPaymentInput['method'],
      paidOn: entry.paidOn,
      note: entry.note.trim() || 'Payment recorded',
      allocations: plan.allocations,
      depositPaisa: deposit,
      advanceCreditPaisa: plan.advancePaisa,
      ...(reference ? { transactionReference: reference } : {}),
      ...(proofFileId ? { proofFileId } : {}),
    },
  };
}
