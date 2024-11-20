import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { readResidentInvoiceBalances } from '../src/resident-invoice-balances.js';
import { residentLedger, stays } from '../src/schema/index.js';
import {
  invoiceReadFixture,
  invoiceReadInput,
  invoiceRow,
} from './resident-invoice-balance.fixture.js';

const input = {
  branchId: invoiceReadInput.branchId,
  today: '2028-02-06',
  invoices: [{ invoiceId: invoiceReadInput.invoiceId, stayId: invoiceReadInput.stayId }],
};
const invoiceId = invoiceReadInput.invoiceId;
function fixture(options: Parameters<typeof invoiceReadFixture>[0] = {}) {
  return invoiceReadFixture({
    adjustments: [],
    allocations: [],
    grace: [{ invoiceId, graceDays: 0 }],
    ...options,
  });
}
it('FIN-001 / AUD-005/012: bounded batch uses five scoped reads and locks Stays before projecting', async () => {
  const f = fixture();
  const balances = await readResidentInvoiceBalances(f.transaction, input);
  expect(balances).toHaveLength(1);
  expect(balances[0]).toMatchObject({ invoiceId, outstandingPaisa: 1800001, state: 'overdue' });
  expect(f.predicates).toHaveLength(5);
  expect(f.locks).toEqual([{ table: stays, mode: 'share' }]);
});
it.each([
  { allocated: '900000', debit: '100', credit: '20', remaining: 900081, state: 'partially_paid' },
  { allocated: '1800001', debit: '0', credit: '0', remaining: 0, state: 'paid' },
  { allocated: '0', debit: '0', credit: '1800001', remaining: 0, state: 'no_charge' },
])(
  'PAY-008 / AUD-005: batch shares canonical $state projection and exact adjustment totals',
  async (row) => {
    const f = fixture({
      adjustments: [{ invoiceId, debit: row.debit, credit: row.credit }],
      allocations: [{ invoiceId, allocated: row.allocated }],
    });
    expect(
      (await readResidentInvoiceBalances(f.transaction, { ...input, today: '2028-02-05' }))[0],
    ).toMatchObject({ state: row.state, outstandingPaisa: row.remaining });
  },
);
it('FIN-001 / AUD-005: batch retains voids and agreed grace without marking waived amounts Paid', async () => {
  const f = fixture({
    invoices: [invoiceRow({ state: 'voided' })],
    adjustments: [{ invoiceId, debit: '0', credit: '1800001' }],
  });
  expect((await readResidentInvoiceBalances(f.transaction, input))[0]?.state).toBe('voided');
  const grace = fixture({ grace: [{ invoiceId, graceDays: 5 }] });
  expect((await readResidentInvoiceBalances(grace.transaction, input))[0]?.state).toBe('issued');
});
it.each([
  { ...input, invoices: [] },
  {
    ...input,
    invoices: Array.from({ length: 101 }, () => ({
      invoiceId: randomUUID(),
      stayId: invoiceReadInput.stayId,
    })),
  },
  { ...input, invoices: [...input.invoices, ...input.invoices] },
  { ...input, branchId: 'invalid' },
])('SEC-001 / AUD-005: invalid or unbounded batch input fails before reads (%#)', async (value) => {
  const f = fixture();
  await expect(readResidentInvoiceBalances(f.transaction, value)).rejects.toThrow();
  expect(f.predicates).toHaveLength(0);
});
it.each([
  { stay: [] },
  { stay: [{ id: randomUUID(), branchId: input.branchId }] },
  { stay: [{ id: invoiceReadInput.stayId, branchId: randomUUID() }] },
  { invoices: [] },
  { invoices: [invoiceRow({ stayId: randomUUID() })] },
  { invoices: [invoiceRow({ branchId: randomUUID() })] },
])(
  'SEC-001 / AUD-005: unavailable or mismatched Stay/invoice scope fails closed (%#)',
  async (options) => {
    const f = fixture(options);
    await expect(readResidentInvoiceBalances(f.transaction, input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  },
);
it.each([
  { grace: [] },
  { grace: [{ invoiceId, graceDays: -1 }] },
  { grace: [{ invoiceId: randomUUID(), graceDays: 0 }] },
  {
    grace: [
      { invoiceId, graceDays: 0 },
      { invoiceId, graceDays: 2 },
    ],
  },
  { adjustments: [{ invoiceId: randomUUID(), debit: '0', credit: '0' }] },
  { allocations: [{ invoiceId: null, allocated: '0' }] },
  {
    adjustments: [
      { invoiceId, debit: '0', credit: '0' },
      { invoiceId, debit: '0', credit: '0' },
    ],
  },
  {
    allocations: [
      { invoiceId, allocated: '0' },
      { invoiceId, allocated: '0' },
    ],
  },
])(
  'FIN-001 / AUD-005: invalid aggregate/grace data cannot become a zero balance (%#)',
  async (options) => {
    const f = fixture(options);
    await expect(readResidentInvoiceBalances(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it('FIN-001 / AUD-005: batch propagates failed aggregate reads', async () => {
  const f = fixture({ fail: residentLedger });
  await expect(readResidentInvoiceBalances(f.transaction, input)).rejects.toThrow(
    'Aggregate read failed',
  );
});
