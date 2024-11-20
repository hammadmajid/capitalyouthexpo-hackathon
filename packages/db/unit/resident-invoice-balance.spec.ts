import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import {
  residentChargeAdjustments,
  residentCharges,
  stayAgreements,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  residentPayments,
  residentReceipts,
  stays,
} from '../src/schema/index.js';
import {
  invoiceReadFixture,
  invoiceReadInput as input,
  invoiceRow,
} from './resident-invoice-balance.fixture.js';
it('FIN-001 / ACC-004: invoice projection locks the scoped Stay, bounds every query and joins approved payment receipts', async () => {
  const f = invoiceReadFixture();
  expect(await readResidentInvoiceBalance(f.transaction, input)).toEqual({
    invoiceId: input.invoiceId,
    invoiceNumber: 'INV-FIXTURE',
    currency: 'PKR',
    dueDate: '2028-02-05',
    graceDays: 0,
    totalPaisa: 1800001,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 1800001,
    state: 'issued',
  });
  expect(f.locks).toEqual([{ table: stays, mode: 'share' }]);
  const dialect = new PgDialect();
  expect(f.predicates.map((entry) => dialect.sqlToQuery(entry.value).params)).toEqual([
    [input.branchId, input.stayId],
    [input.branchId, input.stayId, input.invoiceId],
    [input.branchId, input.stayId, input.invoiceId],
    [input.branchId, input.stayId, 'receivable', input.invoiceId],
    [input.branchId, input.stayId, 'receivable', input.invoiceId],
  ]);
  expect(f.joins.map((entry) => entry.table)).toEqual([
    residentCharges,
    stayAgreements,
    residentChargeAdjustments,
    residentInvoiceCharges,
    residentPayments,
    residentReceipts,
  ]);
  for (const join of f.joins) {
    const text = dialect.sqlToQuery(join.value).sql;
    expect(text).toContain('"branch_id"');
    expect(text).toContain('"stay_id"');
  }
  expect(f.limits).toEqual([
    { table: residentInvoices, value: 1 },
    { table: residentInvoiceCharges, value: 2 },
  ]);
  const paymentJoin = f.joins.find((row) => row.table === residentPayments),
    receiptJoin = f.joins.find((row) => row.table === residentReceipts);
  if (!paymentJoin || !receiptJoin) throw new Error('Missing receipt-backed joins');
  expect(dialect.sqlToQuery(paymentJoin.value).sql).toContain('"funding_payment_id"');
  expect(dialect.sqlToQuery(receiptJoin.value).sql).toContain('"payment_id"');
});
it.each([
  { allocated: '900000', credit: '0', state: 'partially_paid', remaining: 900001 },
  { allocated: '1800001', credit: '0', state: 'paid', remaining: 0 },
  { allocated: '0', credit: '1800001', state: 'no_charge', remaining: 0 },
  { allocated: '1', credit: '1800000', state: 'paid', remaining: 0 },
  { allocated: '0', credit: '0', state: 'issued', remaining: 1800001 },
])(
  'PAY-008 / FIN-001: exact receipt-backed/waiver totals yield $state without an invented payment',
  async (row) => {
    const f = invoiceReadFixture({
      adjustments: [{ debit: '0', credit: row.credit }],
      allocations: [{ allocated: row.allocated }],
    });
    expect(await readResidentInvoiceBalance(f.transaction, input)).toMatchObject({
      state: row.state,
      outstandingPaisa: row.remaining,
      allocatedPaisa: Number(row.allocated),
      creditAdjustmentsPaisa: Number(row.credit),
    });
  },
);
it('FIN-001: posted debit and credit adjustments retain the original issued face value', async () => {
  const f = invoiceReadFixture({
    adjustments: [{ debit: '100', credit: '20' }],
    allocations: [{ allocated: '900000' }],
  });
  expect(await readResidentInvoiceBalance(f.transaction, input)).toMatchObject({
    totalPaisa: 1800001,
    debitAdjustmentsPaisa: 100,
    creditAdjustmentsPaisa: 20,
    allocatedPaisa: 900000,
    outstandingPaisa: 900081,
  });
});
it('RENT-003: server-derived overdue date does not erase an existing partial allocation', async () => {
  const f = invoiceReadFixture({ allocations: [{ allocated: '1' }] });
  expect(
    await readResidentInvoiceBalance(f.transaction, { ...input, today: '2028-02-06' }),
  ).toMatchObject({ state: 'overdue', allocatedPaisa: 1, outstandingPaisa: 1800000 });
});
it('PAY-008: zero-face invoice is no_charge, never paid', async () => {
  const f = invoiceReadFixture({ invoices: [invoiceRow({ totalPaisa: 0n })] });
  expect(await readResidentInvoiceBalance(f.transaction, input)).toMatchObject({
    state: 'no_charge',
    outstandingPaisa: 0,
    allocatedPaisa: 0,
  });
});
it('FIN-001: explicit balanced void retains the original face and cannot become Paid', async () => {
  const f = invoiceReadFixture({
    invoices: [invoiceRow({ state: 'voided' })],
    adjustments: [{ debit: '0', credit: '1800001' }],
  });
  expect(await readResidentInvoiceBalance(f.transaction, input)).toMatchObject({
    state: 'voided',
    totalPaisa: 1800001,
    outstandingPaisa: 0,
  });
});
it.each([{ stay: [] }, { invoices: [] }])(
  'ACC-004: unavailable Stay or invoice is opaque without returning a zero balance (%#)',
  async (options) => {
    const f = invoiceReadFixture(options);
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(f.predicates.length).toBeLessThan(3);
  },
);
it.each([{ id: randomUUID() }, { branchId: randomUUID() }])(
  'ACC-004: inconsistent selected Stay scope case %# fails closed',
  async (patch) => {
    const f = invoiceReadFixture({
      stay: [{ id: input.stayId, branchId: input.branchId, ...patch }],
    });
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it.each([{ id: randomUUID() }, { branchId: randomUUID() }, { stayId: randomUUID() }])(
  'ACC-004: inconsistent selected invoice scope case %# fails closed',
  async (patch) => {
    const f = invoiceReadFixture({ invoices: [invoiceRow(patch)] });
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(f.joins).toHaveLength(0);
  },
);
it.each([
  { totalPaisa: -1n },
  { totalPaisa: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
  { totalPaisa: 1 },
  { number: ' ' },
  { dueDate: '0000-01-01' },
  { state: 'paid' },
])('FIN-001 / SEC-003: invalid persisted invoice case %# cannot display Paid', async (patch) => {
  const f = invoiceReadFixture({ invoices: [invoiceRow(patch)] });
  await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
it.each([
  { adjustments: [] },
  { allocations: [] },
  {
    adjustments: [
      { debit: '0', credit: '0' },
      { debit: '0', credit: '0' },
    ],
  },
  { allocations: [{ allocated: '0' }, { allocated: '0' }] },
  { adjustments: [undefined] },
  { allocations: [undefined] },
  { adjustments: [{ debit: '-1', credit: '0' }] },
  { adjustments: [{ debit: '0', credit: '1.5' }] },
  { allocations: [{ allocated: 'not-money' }] },
  { allocations: [{ allocated: '9007199254740992' }] },
  { allocations: [{ allocated: '9'.repeat(1000) }] },
  { allocations: [{}] },
])(
  'FIN-001: missing, unsafe or malformed aggregate case %# fails instead of inventing zero/Paid',
  async (options) => {
    const f = invoiceReadFixture(options);
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it.each([
  { allocations: [{ allocated: '1800002' }] },
  { invoices: [invoiceRow({ state: 'voided' })] },
  {
    invoices: [invoiceRow({ state: 'voided' })],
    allocations: [{ allocated: '1' }],
    adjustments: [{ debit: '0', credit: '1800000' }],
  },
])(
  'FIN-001: inconsistent authoritative totals case %# cannot masquerade as Paid or a balanced void',
  async (options) => {
    const f = invoiceReadFixture(options);
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it.each([
  { branchId: 'invalid' },
  { stayId: 'invalid' },
  { invoiceId: 'invalid' },
  { today: '0000-01-01' },
  { paid: true },
  { graceDays: 0 },
])('SEC-003: invalid/untrusted invoice read input case %# fails before queries', async (patch) => {
  const f = invoiceReadFixture();
  await expect(readResidentInvoiceBalance(f.transaction, { ...input, ...patch })).rejects.toThrow();
  expect(f.predicates).toHaveLength(0);
});
it('FIN-001: database aggregate failure never falls back to a stale/zero financial result', async () => {
  const f = invoiceReadFixture({ fail: residentLedger });
  await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toThrow(
    'Aggregate read failed',
  );
});

it('PAY-008: the exact safe transport maximum survives approved allocation projection without floating arithmetic', async () => {
  const f = invoiceReadFixture({
    invoices: [invoiceRow({ totalPaisa: BigInt(Number.MAX_SAFE_INTEGER) })],
    allocations: [{ allocated: String(Number.MAX_SAFE_INTEGER) }],
  });
  expect(await readResidentInvoiceBalance(f.transaction, input)).toMatchObject({
    totalPaisa: Number.MAX_SAFE_INTEGER,
    allocatedPaisa: Number.MAX_SAFE_INTEGER,
    outstandingPaisa: 0,
    state: 'paid',
  });
});

it('FIN-001 / ACC-003: unsafe derived outstanding fails closed even when each stored input is individually safe', async () => {
  const value = invoiceReadFixture({
    invoices: [invoiceRow({ totalPaisa: BigInt(Number.MAX_SAFE_INTEGER) })],
    adjustments: [{ debit: '1', credit: '0' }],
  });
  await expect(readResidentInvoiceBalance(value.transaction, input)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
});
it('FIN-001 / ACC-003: cancelling an unsafe intermediate with approved allocations preserves the final exact paisa', async () => {
  const value = invoiceReadFixture({
    invoices: [invoiceRow({ totalPaisa: BigInt(Number.MAX_SAFE_INTEGER) })],
    adjustments: [{ debit: '2', credit: '0' }],
    allocations: [{ allocated: '2' }],
  });
  expect(await readResidentInvoiceBalance(value.transaction, input)).toMatchObject({
    state: 'partially_paid',
    outstandingPaisa: Number.MAX_SAFE_INTEGER,
    debitAdjustmentsPaisa: 2,
    allocatedPaisa: 2,
  });
});
