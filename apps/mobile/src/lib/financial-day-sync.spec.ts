import { afterEach, expect, it, vi } from 'vitest';
import { millisecondsUntilFinancialDay, startFinancialDaySync } from './financial-day-sync.js';
afterEach(() => vi.useRealTimers());
it('RENT-004: schedules the Pakistan date boundary rather than UTC/device midnight', () => {
  expect(millisecondsUntilFinancialDay(new Date('2026-11-02T18:59:59.000Z'))).toBe(1050);
  expect(millisecondsUntilFinancialDay(new Date('2026-11-02T19:00:00.000Z'))).toBe(86400050);
});
it('RENT-004: updates mounted financial/bed queries once at midnight without polling', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T18:59:59.000Z'));
  const invalidateQueries = vi.fn(async () => undefined),
    unsubscribe = vi.fn();
  const stop = startFinancialDaySync(
    { invalidateQueries },
    { active: () => true, subscribe: () => unsubscribe },
  );
  await vi.advanceTimersByTimeAsync(1050);
  expect(invalidateQueries).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3600000);
  expect(invalidateQueries).toHaveBeenCalledTimes(1);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('RENT-004: foreground recovery handles a suspended midnight without background requests', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T18:59:59.000Z'));
  let active = false;
  let check: () => void = () => undefined;
  const invalidateQueries = vi.fn(async () => undefined);
  const stop = startFinancialDaySync(
    { invalidateQueries },
    {
      active: () => active,
      subscribe: (callback) => {
        check = callback;
        return () => undefined;
      },
    },
  );
  await vi.advanceTimersByTimeAsync(1050);
  expect(invalidateQueries).not.toHaveBeenCalled();
  active = true;
  check();
  check();
  expect(invalidateQueries).toHaveBeenCalledTimes(1);
  stop();
});
