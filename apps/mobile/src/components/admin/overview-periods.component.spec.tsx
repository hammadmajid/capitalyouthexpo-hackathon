import { overviewStart } from './overview-periods';
it('HMA-017: quarter and year start at calendar boundaries', () => {
  expect(overviewStart('This quarter', '2026-10-31')).toBe('2026-10-01');
  expect(overviewStart('This quarter', '2027-04-01')).toBe('2027-04-01');
  expect(overviewStart('This quarter', '2027-01-01')).toBe('2027-01-01');
  expect(overviewStart('This year', '2026-10-31')).toBe('2026-01-01');
});
it('HMA-017: inclusive seven days crosses year/leap boundaries correctly', () => {
  expect(overviewStart('7 days', '2027-01-03')).toBe('2026-12-28');
  expect(overviewStart('7 days', '2024-03-02')).toBe('2024-02-25');
});
it('HMA-017: lifetime requires real retained history rather than an invented date', () => {
  expect(overviewStart('Lifetime', '2026-10-31')).toBeUndefined();
  expect(overviewStart('Lifetime', '2026-10-31', '2021-03-05')).toBe('2021-03-05');
});
