import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import * as schema from './schema/index.js';
export * from './schema/index.js';
export * from './authority-events.js';
export function createDatabase(
  connectionString: string,
  options: { connectTimeoutSeconds?: number } = {},
) {
  const url = z
    .string()
    .url()
    .refine((value) => /^postgres(?:ql)?:/.test(value))
    .parse(connectionString);
  const client = postgres(url, {
    max: 10,
    connect_timeout: options.connectTimeoutSeconds ?? 30,
    onnotice: () => undefined,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
export type Database = ReturnType<typeof createDatabase>['db'];

export { expireRoomReservations, sweepExpiredInventory } from './inventory-expiry.js';
export { lockInventoryBranch } from './inventory-lock.js';

export * from './booking-lifecycle.js';

export { postAgreedRentPeriod } from './resident-rent.js';

export { postAgreedFeePeriod } from './resident-fees.js';

export { readResidentInvoiceBalance } from './resident-invoice-balance.js';
export { readResidentInvoiceBalances } from './resident-invoice-balances.js';

export * from './resident-billing-job.js';

export { deliverResidentBilling } from './resident-billing-delivery.js';

export { authorizeResidentBilling } from './resident-billing-authorize.js';
export { initializeAdmissionBilling } from './resident-admission-billing.js';

export { readResidentReceipt } from './resident-receipt.js';

export { recordExternalResidentPayment } from './resident-payment.js';

export { admitManualResident } from './resident-manual-admission.js';
export { checkInConfirmedBooking } from './resident-booking-admission.js';
export { residentLifecyclePayloadSchema } from './resident-lifecycle.js';

export {
  recordResidentNotice,
  type NoticeAuthorizer,
  type NoticePublisher,
} from './resident-notice.js';

export { enqueueVisitLifecycle, visitLifecyclePayloadSchema } from './visit-lifecycle.js';
export * from './visit-follow-up.js';

export * from './inventory-public-policy.js';
export * from './inventory-public-branch.js';
export * from './inventory-operational-availability.js';
export * from './waitlist-lifecycle.js';
export * from './waitlist-availability.js';
export * from './waitlist-sweep.js';
export * from './chat-lifecycle.js';
export {
  enqueueResidentRent,
  sweepRentOverdue,
  residentRentPayloadSchema,
  RESIDENT_RENT_EVENT,
  RENT_OVERDUE_BATCH,
  type ResidentRentPayload,
} from './rent-notices.js';
export { reverseResidentPayment } from './resident-payment-reversal.js';
export { reissueResidentInvoice } from './resident-invoice-reissue.js';
export { readStaySettlement } from './stay-settlement.js';
export { readPostCheckoutActivity } from './stay-post-checkout.js';
export {
  transferStay,
  extendStay,
  checkoutStay,
  lifecycleScopeSchema,
  karachiDate,
  type LifecycleAuthorizer,
} from './stay-lifecycle.js';
export { recordResidentFundMovement } from './resident-fund-movement.js';
export { syncTransportBilling } from './transport-billing.js';
export { branchTransportOffer, includedTransportRoutes } from './transport-inclusion.js';
export { ANNOUNCEMENT_EVENT, deliverAnnouncement } from './announcement-delivery.js';
export { readResidentFundBalance } from './resident-fund-balance.js';
export { readResidentFundBalances } from './resident-fund-balances.js';
export { recoverResidentBilling } from './resident-billing-recovery.js';
export { protectedCnicSchema, type ProtectedCnic } from './resident-cnic.js';
