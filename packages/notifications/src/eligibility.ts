import type { NotificationLease } from './contracts.js';
import type { NotificationTransaction } from './producer.js';
import { waitlistNoticeEligible } from './waitlist-eligibility.js';
import { visitFollowUpEligible } from './visit-eligibility.js';
import { chatRecipients } from './chat-recipients.js';
import { bookingStaffNoticeEligible } from './booking-eligibility.js';
export function notificationEligible(
  tx: NotificationTransaction,
  userId: string,
  payload: NotificationLease['payload'],
  now: Date,
) {
  if (payload.event === 'chat.message.created')
    return chatRecipients(tx, payload.operationId).then((recipients) =>
      recipients.includes(userId),
    );
  if (payload.event === 'waitlist.vacancy')
    return waitlistNoticeEligible(tx, userId, payload.operationId, now);
  if (payload.event === 'visit.follow_up')
    return visitFollowUpEligible(tx, userId, payload.operationId);
  if (payload.event === 'booking.received' || payload.event === 'booking.payment_review')
    return bookingStaffNoticeEligible(tx, userId, payload.event, payload.operationId);
  return true;
}
