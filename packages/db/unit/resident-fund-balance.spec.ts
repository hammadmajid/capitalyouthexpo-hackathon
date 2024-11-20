import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  stays,
  residentLedger,
  residentPayments,
  residentReceipts,
  residentFundMovements,
} from '../src/schema/index.js';
import { readResidentFundBalance } from '../src/resident-fund-balance.js';
import { fundFixture, fundScope as scope, fundTotals } from './resident-fund.fixture.js';
it('RENT-005 / FIN-001: exact held deposit and available advance remain distinct receipt-backed balances', async () => {
  const f = fundFixture();
  expect(await readResidentFundBalance(f.tx, scope)).toEqual({
    deposit: {
      receivedPaisa: 1001,
      appliedToRentPaisa: 200,
      deductedPaisa: 100,
      refundedPaisa: 300,
      heldPaisa: 401,
    },
    advance: {
      receivedPaisa: 500,
      appliedToRentPaisa: 100,
      refundedPaisa: 50,
      availablePaisa: 350,
    },
  });
  expect(f.locks).toEqual([{ table: stays, mode: 'share' }]);
  const dialect = new PgDialect();
  expect(
    f.predicates.map((row) => ({ table: row.table, params: dialect.sqlToQuery(row.value).params })),
  ).toEqual([
    { table: stays, params: [scope.branchId, scope.stayId] },
    { table: residentLedger, params: [scope.branchId, scope.stayId, 'deposit', 'advance'] },
  ]);
  expect(f.joins.filter((row) => row.kind === 'inner').map((row) => row.table)).toEqual([
    residentPayments,
    residentReceipts,
  ]);
  expect(f.joins.at(-1)?.table).toBe(residentFundMovements);
  expect(f.joins.filter((row) => row.kind === 'left')).toHaveLength(2);
});
it('RENT-005: no posted receipts returns exact zero funds instead of an invented deposit', async () => {
  const zero = Object.fromEntries(Object.keys(fundTotals).map((key) => [key, '0']));
  expect(await readResidentFundBalance(fundFixture({ totals: [zero] }).tx, scope)).toMatchObject({
    deposit: { receivedPaisa: 0, heldPaisa: 0 },
    advance: { receivedPaisa: 0, availablePaisa: 0 },
  });
});
it('FIN-001: safe integer boundary remains exact in both fund accounts', async () => {
  const value = {
    ...fundTotals,
    depositReceived: String(Number.MAX_SAFE_INTEGER),
    depositApplied: '0',
    depositDeducted: '0',
    depositRefunded: '0',
    advanceReceived: String(Number.MAX_SAFE_INTEGER),
    advanceApplied: '0',
    advanceRefunded: '0',
  };
  expect(await readResidentFundBalance(fundFixture({ totals: [value] }).tx, scope)).toMatchObject({
    deposit: { heldPaisa: Number.MAX_SAFE_INTEGER },
    advance: { availablePaisa: Number.MAX_SAFE_INTEGER },
  });
});
it.each([
  { stay: [] },
  { stay: [{ id: randomUUID(), branchId: scope.branchId }] },
  { stay: [{ id: scope.stayId, branchId: randomUUID() }] },
])('SEC-003: absent or mismatched Stay %# cannot read fund totals', async (options) => {
  const f = fundFixture(options);
  await expect(readResidentFundBalance(f.tx, scope)).rejects.toMatchObject({
    code: options.stay.length ? 'INTERNAL' : 'NOT_FOUND',
  });
  expect(f.joins).toEqual([]);
});
it.each([{ totals: [] }, { totals: [fundTotals, fundTotals] }])(
  'FIN-001: missing/duplicate authoritative aggregate %# fails closed',
  async (options) => {
    await expect(readResidentFundBalance(fundFixture(options).tx, scope)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
  },
);
it.each([
  'depositReceived',
  'depositApplied',
  'depositDeducted',
  'depositRefunded',
  'advanceReceived',
  'advanceApplied',
  'advanceRefunded',
])('FIN-001: unsafe or malformed %s never becomes zero', async (field) => {
  for (const value of [
    undefined,
    null,
    '-1',
    '01',
    '0.1',
    '9007199254740992',
    '10000000000000000',
    1,
  ])
    await expect(
      readResidentFundBalance(
        fundFixture({ totals: [{ ...fundTotals, [field]: value }] }).tx,
        scope,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
});
it.each([{ depositReceived: '599' }, { advanceReceived: '149' }])(
  'RENT-005: movements exceeding net receipts %# cannot become negative held funds',
  async (patch) => {
    await expect(
      readResidentFundBalance(fundFixture({ totals: [{ ...fundTotals, ...patch }] }).tx, scope),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  },
);
it('FIN-001: database aggregate failure propagates rather than fallback-zero', async () => {
  await expect(
    readResidentFundBalance(fundFixture({ fail: residentLedger }).tx, scope),
  ).rejects.toThrow('Fund aggregate unavailable');
});
it.each([
  { ...scope, branchId: 'bad' },
  { ...scope, stayId: 'bad' },
  { ...scope, paid: true },
])('SEC-003: invalid or fabricated fund scope %# fails before queries', async (value) => {
  const f = fundFixture();
  await expect(readResidentFundBalance(f.tx, value)).rejects.toThrow();
  expect(f.predicates).toEqual([]);
});

it('RENT-005 / SEC-003: a source-specific fund read binds the exact original funding payment', async () => {
  const f = fundFixture(),
    paymentId = randomUUID();
  await readResidentFundBalance(f.tx, { ...scope, paymentId });
  const predicate = f.predicates.at(-1);
  if (!predicate) throw Error('Funding predicate missing');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
    scope.branchId,
    scope.stayId,
    'deposit',
    'advance',
    paymentId,
  ]);
});
