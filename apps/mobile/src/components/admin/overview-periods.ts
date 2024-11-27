import { addRentDays } from '@hsm/contracts';
export const overviewPeriods = [
  'Today',
  '7 days',
  'This month',
  'This quarter',
  'This year',
  'Lifetime',
] as const;
export type OverviewPeriod = (typeof overviewPeriods)[number];
export function overviewStart(period: OverviewPeriod, today: string, earliestAccount?: string) {
  if (period === 'Lifetime') return earliestAccount;
  if (period === 'Today') return today;
  if (period === '7 days') return addRentDays(today, -6n);
  if (period === 'This year') return today.slice(0, 4) + '-01-01';
  if (period === 'This quarter') {
    const firstMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    return today.slice(0, 4) + '-' + String(firstMonth).padStart(2, '0') + '-01';
  }
  return today.slice(0, 7) + '-01';
}
