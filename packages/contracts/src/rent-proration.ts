import { DomainError } from './errors.js';
import { money, type Money } from './money.js';
import type { BillingPolicy } from './billing-policy.js';
// RENT-003 / FIN-001: every rounding decision uses integer arithmetic.
export function prorateRent(
  policy: BillingPolicy['proration'],
  base: bigint,
  used: bigint,
  total: bigint,
  first: boolean,
  manual: number | undefined,
): Money | null {
  const partial = used < total;
  if (manual !== undefined && (policy.kind !== 'manual' || !partial))
    throw new DomainError(
      'VALIDATION_FAILED',
      400,
      'Manual amount is only valid for an explicitly manual partial period',
    );
  if (policy.kind === 'fixed_first_period' && first) return money(BigInt(policy.amountPaisa));
  if (!partial || policy.kind === 'full_period' || policy.kind === 'fixed_first_period')
    return money(base);
  if (policy.kind === 'manual') return manual === undefined ? null : money(BigInt(manual));
  const numerator = base * used,
    quotient = numerator / total,
    remainder = numerator % total;
  const roundUp =
    policy.rounding === 'up'
      ? remainder > 0n
      : policy.rounding === 'half_up' && remainder * 2n >= total;
  return money(quotient + (roundUp ? 1n : 0n));
}
