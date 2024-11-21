import { karachiToday } from '../services/dates.js';

// RPT-001: report calendar ranges include every instant of the selected To day.
// Keep the existing Pakistan +05:00 timestamp convention and use a half-open range.
export const reportStart = (date: string) => new Date(date + 'T00:00:00+05:00');
export const reportEndExclusive = (date: string) =>
  new Date(reportStart(date).getTime() + 86400000);
export const reportDay = (value: Date | null) => (value ? karachiToday(value) : '');
