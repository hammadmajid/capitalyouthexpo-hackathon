import type { DashboardNavigationQueue } from '../../lib/dashboard-queue-path';
export const queueLabels: Record<DashboardNavigationQueue, string> = {
  bookings: 'Booking requests to decide',
  proofs: 'Payment proofs to verify',
  overdue: 'Overdue invoices',
  complaints: 'Unresolved complaints',
  checkouts: 'Upcoming checkouts (14 days)',
};
export const queuePermission = (queue: DashboardNavigationQueue) =>
  queue === 'bookings'
    ? 'booking_manage'
    : queue === 'proofs' || queue === 'overdue'
      ? 'finance_view'
      : 'stay_manage';
