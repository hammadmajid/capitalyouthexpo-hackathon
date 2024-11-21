import {
  DomainError,
  calendarDateSchema,
  type BookingPolicy,
  type BookingQuoteSnapshot,
} from '@hsm/contracts';
const dayMilliseconds = 86400000;
export function pakistanToday(now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new DomainError('VALIDATION_FAILED', 422, 'Invalid clock');
  return new Date(now.getTime() + 5 * 3600000).toISOString().slice(0, 10);
}
export function requireStayPolicy(quote: BookingQuoteSnapshot, now: Date) {
  const start = new Date(calendarDateSchema.parse(quote.range.moveInDate) + 'T00:00:00Z');
  const end = new Date(calendarDateSchema.parse(quote.range.moveOutDate) + 'T00:00:00Z');
  const days = (end.getTime() - start.getTime()) / dayMilliseconds;
  const advance =
    (start.getTime() - new Date(pakistanToday(now) + 'T00:00:00Z').getTime()) / dayMilliseconds;
  const policy = quote.policy;
  if (
    days < policy.minimumStayDays ||
    (policy.maximumStayDays !== 'unlimited' && days > policy.maximumStayDays) ||
    advance < policy.minimumAdvanceDays ||
    advance > policy.maximumAdvanceDays
  )
    throw new DomainError('VALIDATION_FAILED', 422, 'Stay is outside the booking policy');
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const units = policy.allowedStayUnits;
  if (!(
    units.includes('day') ||
    (units.includes('week') && days % 7 === 0) ||
    (units.includes('month') &&
      months > 0 &&
      end.getUTCDate() ===
        Math.min(
          start.getUTCDate(),
          new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate(),
        ))
  ))
    throw new DomainError('VALIDATION_FAILED', 422, 'Stay duration unit is not allowed');
}
export function requireMatchingQuote(
  expected: BookingQuoteSnapshot,
  authoritative: BookingQuoteSnapshot,
) {
  const { quotedAt: expectedTime, ...expectedTerms } = expected;
  const { quotedAt: authoritativeTime, ...actualTerms } = authoritative;
  // Parsed Zod objects have stable property order; quote timestamps never authorize terms.
  if (JSON.stringify(expectedTerms) !== JSON.stringify(actualTerms))
    throw new DomainError('CONFLICT', 409, 'Booking terms changed; request a new quote');
  return { expectedTime, authoritativeTime };
}
export function requireCustomerCancellation(policy: BookingPolicy, moveInDate: string, now: Date) {
  const startsAt = new Date(calendarDateSchema.parse(moveInDate) + 'T00:00:00+05:00').getTime();
  if (
    !policy.cancellationAllowed ||
    startsAt - now.getTime() < policy.cancellationCutoffHours * 3600000
  )
    throw new DomainError('FORBIDDEN', 403, 'Cancellation is outside the booking policy');
}
export function bookingReference(id: string) {
  return 'HSM-' + id.replaceAll('-', '').toUpperCase();
}
