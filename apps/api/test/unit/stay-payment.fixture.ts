import { randomUUID } from 'node:crypto';
export const paymentActor = { userId: randomUUID(), sessionId: randomUUID() };
export const paymentIds = {
  branch: randomUUID(),
  stay: randomUUID(),
  customer: randomUUID(),
  command: randomUUID(),
  payment: randomUUID(),
  receipt: randomUUID(),
  file: randomUUID(),
};
export const paymentNow = new Date('2026-10-20T12:00:00Z');
export const paymentInput = {
  amountPaisa: 1001,
  method: 'cash' as const,
  paidOn: '2026-10-20',
  note: 'Hostel received cash',
  allocations: [],
  depositPaisa: 1001,
  advanceCreditPaisa: 0,
};
export const paymentResult = {
  paymentId: paymentIds.payment,
  receiptId: paymentIds.receipt,
  receiptNumber: 'R-1',
  amountPaisa: 1001,
};
export const paymentStay = {
  id: paymentIds.stay,
  branchId: paymentIds.branch,
  userId: paymentIds.customer,
};
export const paymentAuthority = {
  organizationId: randomUUID(),
  brandId: randomUUID(),
  ownerId: paymentActor.userId,
  actorRole: 'owner' as const,
};
export const paymentFile = {
  id: paymentIds.file,
  uploadedBy: paymentActor.userId,
  bucket: 'private-test',
  visibility: 'private',
  purpose: 'payment_proof',
  scanStatus: 'clean',
  sha256: Buffer.alloc(32, 1),
  objectKey: 'private/payment_proof/' + paymentIds.file + '/source',
};
