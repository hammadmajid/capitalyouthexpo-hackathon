// CHG-039 / SRS v2.27: deterministic salary rules on the Asia/Karachi calendar (UTC+5, no DST).
export type SalaryTiming = 'paid' | 'unpaid' | 'due' | 'overdue';
export const karachiToday = (now: Date) =>
  new Date(now.getTime() + 5 * 3600000).toISOString().slice(0, 10);
export const monthOf = (date: string) => date.slice(0, 7) + '-01';
export function monthEnd(month: string) {
  const date = new Date(month + 'T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}
export const dueOnFor = (month: string, dueDay: number) =>
  month.slice(0, 8) + String(dueDay).padStart(2, '0');
// Paid when nothing is outstanding; otherwise timing comes only from the due date: before it
// "unpaid", on it "due", after it "overdue". `partial` shows money progress alongside timing.
export function salaryState(amount: bigint, net: bigint, dueOn: string, today: string) {
  const outstanding = amount > net ? amount - net : 0n;
  const timing: SalaryTiming =
    outstanding === 0n ? 'paid' : today < dueOn ? 'unpaid' : today === dueOn ? 'due' : 'overdue';
  return { outstanding, timing, partial: net > 0n && outstanding > 0n };
}
// A month is issued automatically only when employment covers all of it.
export const coversMonth = (startsOn: string, endsOn: string | null, month: string) =>
  startsOn <= month && (endsOn === null || endsOn >= monthEnd(month));
// Employment touches the month at all (needed for an explicit partial-month amount).
export const touchesMonth = (startsOn: string, endsOn: string | null, month: string) =>
  startsOn <= monthEnd(month) && (endsOn === null || endsOn >= month);
