import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, residentReceipts, residentPaymentReversals } from '../src/schema/index.js';
import { readResidentReceipt } from '../src/resident-receipt.js';
import {
  receiptFixture,
  receiptRows,
  receiptScope as scope,
  receiptIds as ids,
  receiptTime,
} from './resident-receipt.fixture.js';
it('FIN-001 / PAY-008: private receipt preserves historical names and exact distribution without proof or staff note', async () => {
  const f = receiptFixture();
  const result = await readResidentReceipt(f.tx, scope);
  expect(result).toEqual({
    receiptId: ids.receiptId,
    receiptNumber: 'R-1',
    issuedAt: receiptTime.toISOString(),
    snapshot: receiptRows().receipt.snapshot,
    reversed: false,
  });
  expect(result).not.toHaveProperty('proofFileId');
  expect(result).not.toHaveProperty('note');
  expect(f.locks).toEqual([{ table: stays, mode: 'share' }]);
  expect(f.limits).toEqual([2, 2]);
  const dialect = new PgDialect();
  expect(
    f.predicates.map((row) => ({ table: row.table, params: dialect.sqlToQuery(row.value).params })),
  ).toEqual([
    { table: stays, params: [ids.branchId, ids.stayId] },
    { table: residentReceipts, params: [ids.receiptId, ids.branchId, ids.stayId] },
    { table: residentPaymentReversals, params: [ids.branchId, ids.stayId, ids.paymentId] },
  ]);
});
it('PAY-008: reversal marks historical receipt reversed without rewriting the original receipt facts', async () => {
  const f = receiptFixture({ reversals: [receiptRows().reversal] });
  expect(await readResidentReceipt(f.tx, scope)).toMatchObject({
    reversed: true,
    snapshot: receiptRows().receipt.snapshot,
  });
});
it.each([{ stay: null }, { missing: true }])(
  'SEC-003: missing exact financial child %# is opaque',
  async (options) => {
    await expect(readResidentReceipt(receiptFixture(options).tx, scope)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  },
);
it.each([
  { stay: { id: randomUUID() } },
  { stay: { branchId: randomUUID() } },
  { duplicate: true },
])('SEC-003: corrupt/duplicate scoped financial source %# fails closed', async (options) => {
  await expect(readResidentReceipt(receiptFixture(options).tx, scope)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 500,
  });
});
it.each([
  { receipt: { id: randomUUID() } },
  { receipt: { branchId: randomUUID() } },
  { receipt: { stayId: randomUUID() } },
  { payment: { id: randomUUID() } },
  { payment: { branchId: randomUUID() } },
  { payment: { stayId: randomUUID() } },
  { receipt: { snapshot: { ...receiptRows().receipt.snapshot, paymentId: randomUUID() } } },
  { receipt: { snapshot: { ...receiptRows().receipt.snapshot, branchId: randomUUID() } } },
  { receipt: { snapshot: { ...receiptRows().receipt.snapshot, stayId: randomUUID() } } },
  { payment: { amountPaisa: 1000n } },
  { payment: { method: 'bank_transfer' } },
  { payment: { paidOn: '2028-02-02' } },
  { payment: { transactionReference: 'OTHER' } },
  { payment: { approvedAt: new Date('2028-02-02T06:00:00Z') } },
  { receipt: { snapshot: { ...receiptRows().receipt.snapshot, proofFileId: randomUUID() } } },
  { receipt: { number: '' } },
  { receipt: { issuedAt: new Date(Number.NaN) } },
  { payment: { approvedAt: new Date(Number.NaN) } },
])(
  'SEC-003 / FIN-001: receipt/source mismatch or invalid producer data %# is never a successful receipt',
  async (options) => {
    await expect(readResidentReceipt(receiptFixture(options).tx, scope)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
      message: 'Receipt financial data unavailable',
    });
  },
);
it.each([
  { reversals: [{ ...receiptRows().reversal, branchId: randomUUID() }] },
  { reversals: [{ ...receiptRows().reversal, stayId: randomUUID() }] },
  { reversals: [{ ...receiptRows().reversal, paymentId: randomUUID() }] },
  { reversals: [{ ...receiptRows().reversal, id: 'invalid' }] },
  { reversals: [receiptRows().reversal, receiptRows().reversal] },
])(
  'SEC-003: corrupt reversal provenance %# cannot label a receipt as valid',
  async ({ reversals }) => {
    await expect(
      readResidentReceipt(receiptFixture({ reversals }).tx, scope),
    ).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
  },
);
it.each([
  { ...scope, branchId: 'bad' },
  { ...scope, stayId: 'bad' },
  { ...scope, receiptId: 'bad' },
  { ...scope, userId: randomUUID() },
])('SEC-003: invalid or client-extended receipt scope %# fails before queries', async (value) => {
  const f = receiptFixture();
  await expect(readResidentReceipt(f.tx, value)).rejects.toThrow();
  expect(f.predicates).toEqual([]);
});
