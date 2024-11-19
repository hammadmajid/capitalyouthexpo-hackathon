import { describe, expect, it } from 'vitest';
import { calendarDateSchema, formatDate, isAdult } from './dates.js';
describe('AUTH-C-003: adulthood and Pakistan calendar display', () => {
  it.each([
    ['2008-10-07', '2026-10-07', true],
    ['2008-10-08', '2026-10-07', false],
    ['2007-12-31', '2026-01-01', true],
    ['2009-01-01', '2026-12-31', false],
    ['2008-02-29', '2026-02-28', false],
    ['2008-02-29', '2026-03-01', true],
  ])('compares %s at %s', (birth, today, expected) => expect(isAdult(birth, today)).toBe(expected));
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', 'invalid', '2026-1-01'])(
    'rejects invalid calendar input %s',
    (value) => expect(calendarDateSchema.safeParse(value).success).toBe(false),
  );
  it('accepts leap days and displays UTC instants in Asia/Karachi', () => {
    expect(calendarDateSchema.parse('2024-02-29')).toBe('2024-02-29');
    expect(formatDate('2026-10-06T20:00:00Z')).toBe('7 Oct 2026');
    expect(() => formatDate('invalid')).toThrow();
    expect(() => isAdult('invalid', '2026-10-07')).toThrow();
  });
});
