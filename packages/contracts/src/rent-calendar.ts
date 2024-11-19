const DAY = 86400000n;
const LAST_DATE = BigInt(Date.parse('9999-12-31T00:00:00Z'));
export function addRentDays(date: string, days: bigint): string {
  const epoch = BigInt(Date.parse(date + 'T00:00:00Z')) + days * DAY;
  if (epoch > LAST_DATE) throw new RangeError('Billing date exceeds supported calendar');
  return new Date(Number(epoch)).toISOString().slice(0, 10);
}
export function rentDays(start: string, end: string): bigint {
  return BigInt(Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY;
}
export function rentMonth(anchor: string, offset: bigint, day: number): string {
  const monthIndex =
    BigInt(Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1) + offset;
  const year = monthIndex / 12n,
    month = Number(monthIndex % 12n) + 1;
  if (year > 9999n) throw new RangeError('Billing date exceeds supported calendar');
  const leap = year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  const maximum = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return (
    String(year).padStart(4, '0') +
    '-' +
    String(month).padStart(2, '0') +
    '-' +
    String(Math.min(day, maximum)).padStart(2, '0')
  );
}
