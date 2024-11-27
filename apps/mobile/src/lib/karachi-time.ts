import { DISPLAY_TIME_ZONE } from '@hsm/contracts';
// Every time a person reads is shown in Pakistan time, whatever the phone's own timezone.
const timeFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const clockFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});
export function karachiDateTime(instant: string | Date) {
  return timeFormat.format(typeof instant === 'string' ? new Date(instant) : instant);
}
export function karachiClock(instant: string | Date) {
  return clockFormat.format(typeof instant === 'string' ? new Date(instant) : instant);
}
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE });
const shortDayFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
});
// A chat time: the clock today, otherwise the short date (Pakistan time).
export function chatTime(instant: string | Date, now: Date = new Date()) {
  const value = typeof instant === 'string' ? new Date(instant) : instant;
  return dayFormat.format(value) === dayFormat.format(now)
    ? clockFormat.format(value)
    : shortDayFormat.format(value);
}
