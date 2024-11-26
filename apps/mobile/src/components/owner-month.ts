// Calendar month arithmetic on 'YYYY-MM' strings (no time-zone drift).
export function shiftMonth(month: string, delta: number) {
  const [year = 0, value = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}
export function monthName(month: string) {
  return new Intl.DateTimeFormat('en-PK', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(month + '-01T00:00:00Z'));
}
