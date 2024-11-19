import { expect, it } from 'vitest';
import { invoiceBalance, invoiceBalanceInputSchema } from './finance-balances.js';
const totals = {
  totalPaisa: 1800001,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
};
const base = { totals, dueDate: '2028-02-05', today: '2028-02-05', voided: false };
it.each([
  { today: '2028-02-04', graceDays: 3, allocatedPaisa: 0, state: 'issued' },
  { today: '2028-02-05', graceDays: 3, allocatedPaisa: 0, state: 'issued' },
  { today: '2028-02-06', graceDays: 3, allocatedPaisa: 0, state: 'issued' },
  { today: '2028-02-08', graceDays: 3, allocatedPaisa: 0, state: 'issued' },
  { today: '2028-02-09', graceDays: 3, allocatedPaisa: 0, state: 'overdue' },
  { today: '2028-02-06', graceDays: 0, allocatedPaisa: 0, state: 'overdue' },
  { today: '2028-02-06', graceDays: 3, allocatedPaisa: 1000, state: 'partially_paid' },
  { today: '2028-02-09', graceDays: 3, allocatedPaisa: 1000, state: 'overdue' },
  { today: '9999-12-31', graceDays: Number.MAX_SAFE_INTEGER, allocatedPaisa: 0, state: 'issued' },
])(
  'RB-002 / FIN-002: due/grace boundary case %# yields $state without changing the actual due date',
  ({ today, graceDays, allocatedPaisa, state }) => {
    expect(
      invoiceBalance({ ...base, today, graceDays, totals: { ...totals, allocatedPaisa } }),
    ).toMatchObject({ state, allocatedPaisa, outstandingPaisa: 1800001 - allocatedPaisa });
  },
);
it.each([
  { dueDate: '2028-02-28', today: '2028-02-29', state: 'issued' },
  { dueDate: '2028-02-28', today: '2028-03-01', state: 'overdue' },
  { dueDate: '2028-01-31', today: '2028-02-01', state: 'issued' },
  { dueDate: '2028-01-31', today: '2028-02-02', state: 'overdue' },
])(
  'RB-002 / FIN-002: grace respects leap/month transitions case %#',
  ({ dueDate, today, state }) => {
    expect(invoiceBalance({ ...base, dueDate, today, graceDays: 1 }).state).toBe(state);
  },
);
it.each([
  { totals: { ...totals, allocatedPaisa: 1800001 }, voided: false, state: 'paid' },
  { totals: { ...totals, creditAdjustmentsPaisa: 1800001 }, voided: false, state: 'no_charge' },
  { totals: { ...totals, creditAdjustmentsPaisa: 1800001 }, voided: true, state: 'voided' },
  { totals: { ...totals, totalPaisa: 0 }, voided: false, state: 'no_charge' },
])(
  'PAY-008 / RB-002: grace cannot turn settled/waived/voided/zero invoices into another state (%#)',
  ({ totals, voided, state }) => {
    expect(
      invoiceBalance({ ...base, today: '2028-03-01', graceDays: 3, totals, voided }).state,
    ).toBe(state);
  },
);
it('FIN-002 / SEC-003: missing configured grace is not silently treated as zero', () => {
  expect(invoiceBalanceInputSchema.safeParse(base).success).toBe(false);
  expect(() => invoiceBalance(base)).toThrow();
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '3', null])(
  'FIN-002: invalid configured grace case %# fails safely',
  (graceDays) => {
    expect(invoiceBalanceInputSchema.safeParse({ ...base, graceDays }).success).toBe(false);
  },
);
