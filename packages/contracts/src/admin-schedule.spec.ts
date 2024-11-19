import { expect, it } from 'vitest';
import { karachiLocalInstantSchema } from './dates.js';
it('ADM-010: Karachi scheduling rejects normalized dates and preserves exact UTC offset', () => {
  for (const value of [
    '2027-02-30T10:00',
    '2027-02-29T10:00',
    '2028-02-29T24:00',
    '2028-02-29T10:60',
    '2028-02-29',
  ]) {
    expect(karachiLocalInstantSchema.safeParse(value).success).toBe(false);
  }
  expect(karachiLocalInstantSchema.parse('2028-02-29T00:00')).toBe('2028-02-28T19:00:00.000Z');
});
