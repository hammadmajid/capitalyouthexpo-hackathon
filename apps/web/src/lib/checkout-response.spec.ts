import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { requireCheckoutSnapshot } from './checkout-response';
import {
  checkoutQuote as quote,
  checkoutBranchId as branchId,
} from '../components/checkout.fixture';
it('BKG-004: the exact agreed snapshot accepts normalized branch identity and a refreshed quote timestamp', () => {
  expect(() =>
    requireCheckoutSnapshot(
      { branchId, quote: { ...quote, quotedAt: '2026-10-17T00:01:00.000Z' } },
      branchId.toUpperCase(),
      quote,
    ),
  ).not.toThrow();
});
it('SEC-003: another branch cannot report checkout success', () => {
  expect(() =>
    requireCheckoutSnapshot({ branchId: randomUUID(), quote }, branchId, quote),
  ).toThrow();
});
it.each([
  { ...quote, price: { ...quote.price, monthlyRentPaisa: 1800002 } },
  { ...quote, price: { ...quote.price, depositPaisa: 100 } },
  { ...quote, policyVersion: randomUUID() },
  { ...quote, policyLineage: [randomUUID()] },
  { ...quote, target: { kind: 'room' as const, roomId: randomUUID() } },
  { ...quote, range: { ...quote.range, moveOutDate: '2026-11-21' } },
  { ...quote, policy: { ...quote.policy, bookingMode: 'instant' as const } },
])(
  'BKG-004 / SEC-003: changed terms or allocated identity cannot be shown as the agreed success %#',
  (actual) => {
    expect(() => requireCheckoutSnapshot({ branchId, quote: actual }, branchId, quote)).toThrow();
  },
);
