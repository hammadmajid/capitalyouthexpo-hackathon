import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { readResidentFundBalances } from '../src/resident-fund-balances.js';
import { residentLedger, stays } from '../src/schema/index.js';
import { fundFixture, fundScope, fundTotals } from './resident-fund.fixture.js';

const input = { branchId: fundScope.branchId, stayIds: [fundScope.stayId] };
const total = { ...fundTotals, stayId: fundScope.stayId };
it('RENT-005 / AUD-006: bounded batch shares canonical receipt-backed balances using two scoped reads', async () => {
  const f = fundFixture({ totals: [total] });
  expect(await readResidentFundBalances(f.tx, input)).toMatchObject([
    {
      stayId: fundScope.stayId,
      deposit: { receivedPaisa: 1001, heldPaisa: 401 },
      advance: { receivedPaisa: 500, availablePaisa: 350 },
    },
  ]);
  expect(f.predicates).toHaveLength(2);
  expect(f.locks).toEqual([{ table: stays, mode: 'share' }]);
});
it('RENT-005 / AUD-006: a Stay without any grouped financial rows has exact zero funds', async () => {
  const result = await readResidentFundBalances(fundFixture({ totals: [] }).tx, input);
  expect(result[0]).toMatchObject({
    deposit: { receivedPaisa: 0, heldPaisa: 0 },
    advance: { availablePaisa: 0 },
  });
});
it.each([
  { ...input, stayIds: [] },
  { ...input, stayIds: Array.from({ length: 101 }, () => randomUUID()) },
  { ...input, stayIds: [...input.stayIds, ...input.stayIds] },
  { ...input, branchId: 'invalid' },
  { ...input, paymentId: randomUUID() },
])('SEC-003 / AUD-006: invalid or unbounded scope fails before reads (%#)', async (value) => {
  const f = fundFixture();
  await expect(readResidentFundBalances(f.tx, value)).rejects.toThrow();
  expect(f.predicates).toHaveLength(0);
});
it.each([
  { stay: [] },
  { stay: [{ id: randomUUID(), branchId: input.branchId }] },
  { stay: [{ id: fundScope.stayId, branchId: randomUUID() }] },
  {
    stay: [
      { id: fundScope.stayId, branchId: input.branchId },
      { id: fundScope.stayId, branchId: input.branchId },
    ],
  },
])('SEC-003 / AUD-006: missing or foreign Stay fails closed (%#)', async (options) => {
  await expect(readResidentFundBalances(fundFixture(options).tx, input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it.each([
  { totals: [total, total] },
  { totals: [{ ...total, stayId: randomUUID() }] },
  { totals: [{ ...total, depositReceived: '-1' }] },
])(
  'FIN-001 / AUD-006: ambiguous, foreign or invalid aggregate fails closed (%#)',
  async (options) => {
    await expect(readResidentFundBalances(fundFixture(options).tx, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it('FIN-001 / AUD-006: failed database aggregation never becomes an empty successful result', async () => {
  await expect(
    readResidentFundBalances(fundFixture({ fail: residentLedger }).tx, input),
  ).rejects.toThrow('Fund aggregate unavailable');
});
