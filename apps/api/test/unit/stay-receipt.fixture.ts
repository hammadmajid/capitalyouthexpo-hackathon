import { randomUUID } from 'node:crypto';
import { invoiceActor, invoiceNow, invoiceStay, invoiceIds } from './stay-invoice.fixture.js';
export const receiptActor = invoiceActor,
  receiptNow = invoiceNow,
  receiptStay = invoiceStay;
export const receiptIds = {
  branch: invoiceIds.branch,
  stay: invoiceIds.stay,
  receipt: randomUUID(),
  payment: randomUUID(),
};
export const receiptDetail = {
  receiptId: receiptIds.receipt,
  receiptNumber: 'R-1',
  issuedAt: receiptNow.toISOString(),
  reversed: false,
  snapshot: {
    version: 1 as const,
    currency: 'PKR' as const,
    paymentId: receiptIds.payment,
    branchId: receiptIds.branch,
    stayId: receiptIds.stay,
    residentName: 'Historical resident',
    hostelName: 'Historical hostel',
    branchName: 'Historical branch',
    amountPaisa: 1001,
    method: 'cash' as const,
    transactionReference: null,
    paidOn: '2028-02-01',
    approvedAt: receiptNow.toISOString(),
    allocations: [],
    distribution: { allocatedPaisa: 0, depositPaisa: 1000, advanceCreditPaisa: 1 },
  },
};
