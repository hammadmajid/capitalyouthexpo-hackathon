import { describe, expect, it } from 'vitest';
import { residentContactUpdateSchema } from './residents.js';
describe('RES-006: resident contact update', () => {
  it('trims the name and normalises email', () => {
    expect(
      residentContactUpdateSchema.parse({
        displayName: '  Ali Raza ',
        phone: '+923001234567',
        email: 'Ali@Example.COM',
      }),
    ).toEqual({ displayName: 'Ali Raza', phone: '+923001234567', email: 'ali@example.com' });
  });
  it('allows clearing optional contacts', () => {
    expect(
      residentContactUpdateSchema.parse({ displayName: 'Ali', phone: null, email: null }),
    ).toEqual({ displayName: 'Ali', phone: null, email: null });
  });
  it.each([
    { displayName: '', phone: null, email: null },
    { displayName: 'Ali', phone: '03001234567', email: null },
    { displayName: 'Ali', phone: null, email: 'not-an-email' },
    { displayName: 'Ali', phone: null, email: null, userId: 'x' },
  ])('rejects invalid input %#', (input) => {
    expect(residentContactUpdateSchema.safeParse(input).success).toBe(false);
  });
});
