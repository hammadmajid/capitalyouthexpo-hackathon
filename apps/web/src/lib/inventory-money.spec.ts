import { expect, it } from 'vitest';
import { inventoryPaisa, inventoryRupees } from './inventory-money';
it.each<[string, number]>([
  ['18000.01', 1800001],
  ['0', 0],
  [' 1.5 ', 150],
  ['90071992547409.91', Number.MAX_SAFE_INTEGER],
])('BKG-004: %s rupees converts exactly to %s paisa', (input, expected) => {
  expect(inventoryPaisa(input)).toBe(expected);
  expect(inventoryPaisa(inventoryRupees(expected))).toBe(expected);
});
it.each(['', '-1', '+1', '01', '1e3', '.5', '1.', '1.001', 'NaN', 'Infinity', '90071992547409.92'])(
  'BKG-004: ambiguous, negative or unsafe price fails: %s',
  (input) => {
    expect(() => inventoryPaisa(input)).toThrow();
  },
);
it('BKG-004: invalid stored money cannot be rendered as a valid editable price', () => {
  expect(() => inventoryRupees(-1)).toThrow();
  expect(() => inventoryRupees(0.1)).toThrow();
});

it('BKG-004: oversized price input is rejected before integer conversion', () => {
  expect(() => inventoryPaisa('9'.repeat(10000))).toThrow();
});
