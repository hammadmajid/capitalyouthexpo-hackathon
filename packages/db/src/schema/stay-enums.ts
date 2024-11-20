import { pgEnum } from 'drizzle-orm/pg-core';
export const stayState = pgEnum('stay_state_enum', [
  'check_in_ready',
  'active',
  'notice_given',
  'checkout_pending',
  'completed',
  'cancelled_before_checkin',
  'terminated',
  'abandoned',
]);
export const staySource = pgEnum('stay_source_enum', ['booking', 'manual']);
