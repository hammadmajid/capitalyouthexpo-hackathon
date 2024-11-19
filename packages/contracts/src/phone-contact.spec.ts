import { expect, it } from 'vitest';
import { contactPhoneE164 } from './phone.js';
it.each([
  ['03154796657', '+923154796657'],
  ['0315-4796657', '+923154796657'],
  ['051-1234567', '+92511234567'],
  ['(051) 123 4567', '+92511234567'],
  ['923154796657', '+923154796657'],
  ['00923154796657', '+923154796657'],
  ['+44 20 7946 0958', '+442079460958'],
])('TRUST-006: contact %s becomes %s', (input, expected) => {
  expect(contactPhoneE164(input)).toBe(expected);
});
it.each(['', '()', '0', '+0123456', '12345'])('TRUST-006: %s cannot be a public phone', (input) => {
  expect(contactPhoneE164(input)).toBeNull();
});
