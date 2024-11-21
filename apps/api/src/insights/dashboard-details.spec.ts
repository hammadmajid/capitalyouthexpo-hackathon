import { expect, it } from 'vitest';
import {
  collectedCategories,
  emptyDashboardDetails,
  sumDashboardDetails,
} from './dashboard-details.js';
it('OWN-004: combined receipt analytics retain every paisa without security or invented transport', () => {
  expect(collectedCategories(750001, 1000000n, 500000n, 0n)).toEqual({
    rent: 500001,
    transport: 250000,
    other: 0,
  });
  expect(collectedCategories(100, 0n, 1n, 2n)).toEqual({ rent: 0, transport: 33, other: 67 });
  expect(collectedCategories(100, 0n, 0n, 0n)).toEqual({ rent: 0, transport: 0, other: 100 });
});
it('OWN-004: six real calendar buckets, exact aggregation and year rollover', () => {
  const a = emptyDashboardDetails('2026-02');
  expect(a.trend.map((p) => p.month)).toEqual([
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
  ]);
  a.salaryDuePaisa = 123;
  a.transportRequests = 2;
  a.unreadMessages = 3;
  const last = a.trend.at(-1);
  if (last) last.collectedPaisa = 12345;
  const total = sumDashboardDetails([a, a], '2026-02');
  expect(total).toMatchObject({ salaryDuePaisa: 246, transportRequests: 4, unreadMessages: 6 });
  expect(total.trend.at(-1)?.collectedPaisa).toBe(24690);
});
