import { DISPLAY_TIME_ZONE, instantSchema } from './dates.js';
import { DomainError } from './errors.js';
import { visitCommandSchema, visitTimingSchema, visitingScheduleSchema } from './visits.js';
import type { VisitTiming } from './visits.js';
const localClock = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
// VISIT-001 / SRS p.23: empty configuration never invents available visiting hours.
export function visitStartIsWithinHours(start: unknown, schedule: unknown): boolean {
  const instant = instantSchema.parse(start),
    windows = visitingScheduleSchema.parse(schedule);
  const parts = localClock.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday') ?? '');
  const time = `${part('hour')}:${part('minute')}`;
  return windows.some(
    (window) => window.dayOfWeek === day && window.opensAt <= time && time < window.closesAt,
  );
}
export function requireFutureVisitStart(start: unknown, schedule: unknown, now: unknown): string {
  const instant = instantSchema.parse(start),
    current = instantSchema.parse(now);
  if (Date.parse(instant) <= Date.parse(current) || !visitStartIsWithinHours(instant, schedule))
    throw new DomainError(
      'VALIDATION_FAILED',
      422,
      'Visit must start in future configured visiting hours',
    );
  return instant;
}
function invalidTransition(): never {
  throw new DomainError('CONFLICT', 409, 'Visit transition is not allowed');
}
function acceptVisit(
  visit: VisitTiming,
  action: 'approve' | 'accept-reschedule',
  schedule: unknown,
  now: string,
): VisitTiming {
  if (action === 'approve') {
    if (visit.status !== 'requested') return invalidTransition();
    return {
      ...visit,
      status: 'approved',
      requestedStart: requireFutureVisitStart(visit.requestedStart, schedule, now),
    };
  }
  if (visit.status !== 'rescheduled') return invalidTransition();
  return {
    status: 'approved',
    requestedStart: requireFutureVisitStart(visit.proposedStart, schedule, now),
    proposedStart: null,
  };
}
function closeVisit(visit: VisitTiming, action: 'complete' | 'no-show', now: string): VisitTiming {
  if (visit.status !== 'approved' || Date.parse(visit.requestedStart) > Date.parse(now))
    return invalidTransition();
  return { ...visit, status: action === 'complete' ? 'completed' : 'no_show' };
}
// This pure transition is not authorization. Callers must recheck live object/branch access in the transaction.
export function planVisitTransition(
  current: unknown,
  command: unknown,
  schedule: unknown,
  now: unknown,
): VisitTiming {
  const visit = visitTimingSchema.parse(current),
    input = visitCommandSchema.parse(command);
  const clock = instantSchema.parse(now);
  if (!['requested', 'approved', 'rescheduled'].includes(visit.status))
    throw new DomainError('CONFLICT', 409, 'Visit is already closed');
  if (input.action === 'cancel' || input.action === 'reject')
    return {
      ...visit,
      status: input.action === 'cancel' ? 'cancelled' : 'rejected',
      proposedStart: null,
    };
  if (input.action === 'reschedule') {
    const proposedStart = requireFutureVisitStart(input.proposedStart, schedule, clock);
    if (Date.parse(proposedStart) === Date.parse(visit.requestedStart))
      throw new DomainError('CONFLICT', 409, 'A reschedule must propose a different time');
    return { ...visit, status: 'rescheduled', proposedStart };
  }
  if (input.action === 'approve' || input.action === 'accept-reschedule')
    return acceptVisit(visit, input.action, schedule, clock);
  return closeVisit(visit, input.action, clock);
}
