import { expect, it } from 'vitest';
import { billingPaisa } from './billing-money';
it.each([
  ['0', 0],
  ['0.00', 0],
  ['0.01', 1],
  ['12.5', 1250],
  [' 12.50 ', 1250],
  ['90071992547409.91', Number.MAX_SAFE_INTEGER],
])('FIN-004: native exact PKR input %s becomes integer paisa', (text, expected) => {
  expect(billingPaisa(String(text))).toBe(expected);
});
it.each([
  '',
  ' ',
  '-1',
  '+1',
  '01',
  '.5',
  '1.',
  '1.001',
  '1e3',
  '1,000',
  'NaN',
  'Infinity',
  '90071992547409.92',
  '1'.repeat(100),
])('FIN-004: invalid native PKR input %s cannot round or become an inferred amount', (text) => {
  expect(() => billingPaisa(text)).toThrow();
});
