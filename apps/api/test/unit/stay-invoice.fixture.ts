import { randomUUID } from 'node:crypto';
export const invoiceActor = { userId: randomUUID(), sessionId: randomUUID() };
export const invoiceIds = { branch: randomUUID(), stay: randomUUID(), invoice: randomUUID() };
export const invoiceNow = new Date('2028-02-01T06:00:00Z');
export const invoiceBalance = {
  invoiceId: invoiceIds.invoice,
  invoiceNumber: 'INV-1',
  currency: 'PKR' as const,
  dueDate: '2028-02-05',
  graceDays: 2,
  totalPaisa: 1000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1000,
  state: 'issued' as const,
};
export const invoiceStay = {
  id: invoiceIds.stay,
  branchId: invoiceIds.branch,
  userId: invoiceActor.userId,
};
