import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { InvoiceBalance, totalPayable } from './stay-invoices';
afterEach(cleanup);
function bill(change: Partial<ResidentInvoiceBalance> = {}) {
  return {
    invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoiceNumber: 'INV-9',
    currency: 'PKR',
    dueDate: '2026-12-01',
    graceDays: 3,
    totalPaisa: 2000000,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 2000000,
    state: 'issued',
    lineItems: [
      { kind: 'rent', description: 'Rent', amountPaisa: 1000000 },
      { kind: 'transport', description: 'Transport · December', amountPaisa: 1000000 },
    ],
    securityDuePaisa: 500000,
    ...change,
  } as ResidentInvoiceBalance;
}
it('CHG-061: rent, transport and security show separately with one total payable', () => {
  render(<InvoiceBalance value={bill()} onClose={() => undefined} />);
  expect(screen.getByText('Rent: PKR 10,000.00')).toBeTruthy();
  expect(screen.getByText('Transport: PKR 10,000.00')).toBeTruthy();
  expect(screen.getByText('Security deposit due: PKR 5,000.00')).toBeTruthy();
  expect(screen.getByText('Total payable: PKR 25,000.00')).toBeTruthy();
});
it('CHG-055 / CHG-061: security already proved and awaiting review is not asked for again', () => {
  const pending = bill({ securityPendingPaisa: 500000 });
  expect(totalPayable(pending)).toBe(2000000);
  render(<InvoiceBalance value={pending} onClose={() => undefined} />);
  expect(screen.getByText('Security proof awaiting hostel review: PKR 5,000.00')).toBeTruthy();
  expect(screen.getByText('Total payable: PKR 20,000.00')).toBeTruthy();
  expect(totalPayable(bill({ lineItems: undefined, securityDuePaisa: undefined }))).toBe(2000000);
});
