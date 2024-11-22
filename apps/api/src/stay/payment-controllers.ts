import { StayPaymentController, STAY_PAYMENT_SERVICE } from './payment.controller.js';
import { StayInvoiceReissueController } from './invoice-reissue.controller.js';
// Both Stay money command controllers share the payment service.
export const STAY_PAYMENT_CONTROLLERS = [StayPaymentController, StayInvoiceReissueController];
export { STAY_PAYMENT_SERVICE };
