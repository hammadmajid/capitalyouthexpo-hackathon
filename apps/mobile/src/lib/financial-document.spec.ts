import { expect, it } from 'vitest';
import { invoiceDocument } from './financial-document';
const base = {
  invoiceId: '10000000-0000-4000-8000-000000000001',
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2026-11-05',
  graceDays: 0,
  totalPaisa: 1000000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1000000,
  state: 'issued',
};
it.each([
  [0, 0, 'PKR 10,000'],
  [1000000, 0, 'PKR 20,000'],
  [1000000, 500000, 'PKR 25,000'],
])(
  'PAY-008: one invoice classifies security %s and transport %s without losing the total',
  (security, transport, total) => {
    const document = invoiceDocument({
      ...base,
      totalPaisa: 1000000 + transport,
      outstandingPaisa: 1000000 + transport,
      securityDuePaisa: security,
      lineItems: [
        { kind: 'rent', description: 'Monthly rent', amountPaisa: 1000000 },
        ...(transport
          ? [{ kind: 'transport', description: 'Transport', amountPaisa: transport }]
          : []),
      ],
    });
    expect(document.rows).toContainEqual(['Rent', 'PKR 10,000']);
    expect(document.rows).toContainEqual(['Total payable', total]);
    if (transport) expect(document.rows).toContainEqual(['Transport', 'PKR 5,000']);
  },
);
it('PAY-008: security already paid or pending is not added again to the payable total', () => {
  expect(invoiceDocument({ ...base, securityDuePaisa: 0 }).rows).toContainEqual([
    'Total payable',
    'PKR 10,000',
  ]);
  expect(
    invoiceDocument({ ...base, securityDuePaisa: 1000000, securityPendingPaisa: 1000000 }).rows,
  ).toContainEqual(['Total payable', 'PKR 10,000']);
});
