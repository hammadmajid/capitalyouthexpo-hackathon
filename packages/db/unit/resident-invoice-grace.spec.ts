import { expect, it } from 'vitest';
import { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import {
  invoiceReadFixture,
  invoiceReadInput as input,
} from './resident-invoice-balance.fixture.js';
it.each([
  ['2028-02-06', 'issued'],
  ['2028-02-08', 'issued'],
  ['2028-02-09', 'overdue'],
])(
  'RB-002 / FIN-002: original agreed grace, not just due date, governs %s as %s',
  async (today, state) => {
    const f = invoiceReadFixture({ grace: [{ graceDays: 3 }] });
    expect(await readResidentInvoiceBalance(f.transaction, { ...input, today })).toMatchObject({
      graceDays: 3,
      dueDate: '2028-02-05',
      state,
      outstandingPaisa: 1800001,
    });
  },
);
it('RB-002 / PAY-008: partial approved allocation remains partial within the original agreement grace', async () => {
  const f = invoiceReadFixture({ grace: [{ graceDays: 3 }], allocations: [{ allocated: '1000' }] });
  expect(
    await readResidentInvoiceBalance(f.transaction, { ...input, today: '2028-02-06' }),
  ).toMatchObject({
    graceDays: 3,
    state: 'partially_paid',
    allocatedPaisa: 1000,
    outstandingPaisa: 1799001,
  });
});
it.each([
  { grace: [] },
  { grace: [{ graceDays: 0 }, { graceDays: 3 }] },
  { grace: [undefined] },
  { grace: [{ graceDays: -1 }] },
  { grace: [{ graceDays: 0.5 }] },
  { grace: [{ graceDays: '3' }] },
  { grace: [{ graceDays: null }] },
  { grace: [{ graceDays: Number.MAX_SAFE_INTEGER + 1 }] },
])(
  'FIN-002 / SEC-003: missing/conflicting/invalid original grace case %# fails closed, never defaults to zero',
  async ({ grace }) => {
    const f = invoiceReadFixture({ grace });
    await expect(readResidentInvoiceBalance(f.transaction, input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
