import { expect, it } from 'vitest';
import { marketplacePrice } from './marketplace-money.js';
it('BKG-004: monthly price display retains integer paisa without floating arithmetic', () => {
  expect(marketplacePrice(1800000)).toBe('PKR 18,000');
  expect(marketplacePrice(1800001)).toBe('PKR 18,000.01');
  expect(marketplacePrice(1800099)).toBe('PKR 18,000.99');
  expect(marketplacePrice(0)).toBe('PKR 0');
  expect(() => marketplacePrice(1.5)).toThrow();
  expect(() => marketplacePrice(-1)).toThrow();
});
