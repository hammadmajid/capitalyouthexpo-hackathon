import { expect, it } from 'vitest';
import {
  coversMonth,
  dueOnFor,
  karachiToday,
  monthEnd,
  salaryState,
  touchesMonth,
} from './staff-rules.js';
it('CHG-039: salary timing follows the Karachi date with no invented grace period', () => {
  expect(salaryState(3000000n, 0n, '2026-06-26', '2026-06-25')).toEqual({
    outstanding: 3000000n,
    timing: 'unpaid',
    partial: false,
  });
  expect(salaryState(3000000n, 0n, '2026-06-25', '2026-06-25').timing).toBe('due');
  expect(salaryState(3000000n, 1000000n, '2026-06-24', '2026-06-25')).toEqual({
    outstanding: 2000000n,
    timing: 'overdue',
    partial: true,
  });
  expect(salaryState(3000000n, 3000000n, '2026-06-24', '2026-06-25')).toEqual({
    outstanding: 0n,
    timing: 'paid',
    partial: false,
  });
  expect(salaryState(0n, 0n, '2026-06-24', '2026-06-25').timing).toBe('paid');
});
it('CHG-039: Karachi date, month ends and full-month coverage', () => {
  expect(karachiToday(new Date('2026-06-24T19:30:00Z'))).toBe('2026-06-25');
  expect(karachiToday(new Date('2026-06-24T18:59:00Z'))).toBe('2026-06-24');
  expect(monthEnd('2026-02-01')).toBe('2026-02-28');
  expect(monthEnd('2028-02-01')).toBe('2028-02-29');
  expect(dueOnFor('2026-06-01', 5)).toBe('2026-06-05');
  expect(coversMonth('2026-05-01', null, '2026-06-01')).toBe(true);
  expect(coversMonth('2026-06-10', null, '2026-06-01')).toBe(false);
  expect(coversMonth('2026-05-01', '2026-06-20', '2026-06-01')).toBe(false);
  expect(touchesMonth('2026-06-10', null, '2026-06-01')).toBe(true);
  expect(touchesMonth('2026-07-02', null, '2026-06-01')).toBe(false);
});
