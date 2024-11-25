import { randomUUID } from 'node:crypto';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
export const checkoutBranchId = randomUUID(),
  checkoutActorId = randomUUID();
const policyId = randomUUID();
export const checkoutQuote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  target: { kind: 'room', roomId: randomUUID() },
  range: { moveInDate: '2026-10-20', moveOutDate: '2026-11-20' },
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-17T00:00:00.000Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});
export const checkoutBookingId = randomUUID();
export const checkoutBooking = {
  id: checkoutBookingId,
  branchId: checkoutBranchId,
  reference: 'HSM-' + checkoutBookingId.replaceAll('-', '').toUpperCase(),
  state: 'pending_request' as const,
  quote: checkoutQuote,
  createdAt: '2026-10-17T00:01:00.000Z',
  requestExpiresAt: '2026-10-17T01:01:00.000Z',
  documents: [],
  upfront: null,
};
