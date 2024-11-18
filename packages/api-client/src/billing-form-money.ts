import { moneyJsonSchema } from '@hsm/contracts';
// BKG-004: convert decimal rupee input using integer arithmetic, never a float.
export function billingFormPaisa(input: string): number {
  if (input.trim().length > 17) throw new Error('Amount exceeds the supported limit');
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error('Enter a non-negative rupee amount with at most two decimal places');
  const paisa = BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (paisa > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Amount exceeds the supported limit');
  return moneyJsonSchema.parse(Number(paisa));
}
export function billingFormRupees(paisa: number): string {
  const value = BigInt(moneyJsonSchema.parse(paisa));
  return String(value / 100n) + '.' + String(value % 100n).padStart(2, '0');
}
