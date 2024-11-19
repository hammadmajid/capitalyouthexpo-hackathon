import { z } from 'zod';
export const DISPLAY_TIME_ZONE = 'Asia/Karachi';
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');
export const instantSchema = z.string().datetime();
// ADM-010: local minute input must round-trip; Date alone normalizes impossible dates.
export const karachiLocalInstantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine(
    (value) => calendarDateSchema.safeParse(value.slice(0, 10)).success,
    'Invalid calendar date',
  )
  .transform((value) => new Date(value + ':00+05:00').toISOString());
export function formatDate(instant: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: DISPLAY_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instantSchema.parse(instant)));
}
// AUTH-C-003: exact eighteenth birthday; dates are calendar concepts.
export function isAdult(birthDate: string, today: string): boolean {
  const birth = calendarDateSchema.parse(birthDate);
  const current = calendarDateSchema.parse(today);
  const years = Number(current.slice(0, 4)) - Number(birth.slice(0, 4));
  return years > 18 || (years === 18 && current.slice(5) >= birth.slice(5));
}
