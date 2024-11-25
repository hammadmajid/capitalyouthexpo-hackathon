// Every time a person reads is shown in Pakistan time, whatever the browser's own timezone.
const zone = 'Asia/Karachi';
const timeFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: zone,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone });
export function karachiDateTime(instant: string | Date) {
  return timeFormat.format(typeof instant === 'string' ? new Date(instant) : instant);
}
// YYYY-MM-DD for "today" in Pakistan (not the UTC date, which lags until 05:00 PKT).
export function karachiToday(now = new Date()) {
  return dayFormat.format(now);
}
