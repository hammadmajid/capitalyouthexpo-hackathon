import { describe, expect, it, vi } from 'vitest';
import {
  money,
  moneyFromJson,
  moneyToJson,
  addMoney,
  subtractMoney,
  formatMoney,
  formatExactMoney,
} from './money.js';
describe('SRS p.47: integer paisa and API §1 transport', () => {
  it('roundtrips zero and the maximum safe transport amount exactly', () => {
    for (const value of [0, 1, 1200000, Number.MAX_SAFE_INTEGER]) {
      expect(moneyToJson(moneyFromJson(value))).toBe(value);
    }
  });
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null])(
    'rejects unsafe or non-integer transport %s',
    (value) => expect(() => moneyFromJson(value)).toThrow(),
  );
  it('keeps domain arithmetic exact beyond JSON range', () => {
    const large = money(BigInt(Number.MAX_SAFE_INTEGER));
    expect(addMoney(large, money(1n))).toBe(9007199254740992n);
    expect(() => moneyToJson(addMoney(large, money(1n)))).toThrow(RangeError);
    expect(subtractMoney(large, money(1n))).toBe(9007199254740990n);
  });
  it('rejects negative balances', () => {
    expect(() => money(-1n)).toThrow(RangeError);
    expect(() => subtractMoney(money(0n), money(1n))).toThrow(RangeError);
  });
  it('formats bigint rupees without floating point or fractional display', () => {
    expect(formatMoney(money(1200000n))).toBe('PKR 12,000');
    expect(formatMoney(money(99n))).toBe('PKR 0');
    expect(formatMoney(money(900719925474099200n))).toBe('PKR 9,007,199,254,740,992');
  });
});

it.each([
  [0n, 'PKR 0.00'],
  [1n, 'PKR 0.01'],
  [99n, 'PKR 0.99'],
  [100n, 'PKR 1.00'],
  [1001n, 'PKR 10.01'],
  [9007199254740991n, 'PKR 90,071,992,547,409.91'],
  [900719925474099200n, 'PKR 9,007,199,254,740,992.00'],
] as const)('FIN-001: exact display retains integer paisa for %s', (paisa, expected) => {
  expect(formatExactMoney(money(paisa))).toBe(expected);
});
it('FIN-001 mobile: formatting never hands BigInt to Intl (Hermes cannot format it)', () => {
  const format = vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => {
    throw new TypeError('Cannot convert BigInt to number');
  });
  try {
    expect(formatMoney(money(123456700n))).toBe('PKR 1,234,567');
    expect(formatExactMoney(money(1234567n))).toBe('PKR 12,345.67');
    expect(formatMoney(money(99999n))).toBe('PKR 999');
  } finally {
    format.mockRestore();
  }
});
