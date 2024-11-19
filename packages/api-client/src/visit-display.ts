import { z } from 'zod';
import {
  calendarDateSchema,
  DISPLAY_TIME_ZONE,
  instantSchema,
  type VisitCommand,
  type VisitSummary,
} from '@hsm/contracts';
export function visitStartFromLocal(date: string, time: string) {
  const day = calendarDateSchema.parse(date),
    minute = z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .parse(time);
  return new Date(day + 'T' + minute + ':00+05:00').toISOString();
}
export function formatVisitStart(start: string) {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instantSchema.parse(start)));
}
export function visitAvailableActions(
  visit: VisitSummary,
  management: boolean,
  now: number,
): VisitCommand['action'][] {
  if (!['requested', 'approved', 'rescheduled'].includes(visit.status)) return [];
  if (!management)
    return visit.status === 'rescheduled' ? ['cancel', 'accept-reschedule'] : ['cancel'];
  const result: VisitCommand['action'][] = ['reschedule', 'reject'];
  if (visit.status === 'requested') result.unshift('approve');
  if (visit.status === 'approved' && Date.parse(visit.requestedStart) <= now)
    result.push('complete', 'no-show');
  return result;
}
