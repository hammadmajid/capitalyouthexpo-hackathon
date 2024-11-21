import { notificationEventSchema, type NotificationEvent } from './contracts.js';
const templates: Record<NotificationEvent, { title: string; body: string }> = {
  'chat.message.created': {
    title: 'New hostel message',
    body: 'A new message is available in a hostel conversation. Open Messages to view the current conversation.',
  },
  'waitlist.vacancy': {
    title: 'Hostel availability changed',
    body: 'Availability changed for a hostel on your waiting list. Open My waiting list and check current availability. This alert does not reserve a bed, guarantee availability or take payment.',
  },
  'visit.follow_up': {
    title: 'Still interested?',
    body: 'Your hostel visit is complete. Open My visits to tell the hostel whether you remain interested. This visit receives one follow-up prompt.',
  },
  'visit.changed': {
    title: 'Visit updated',
    body: 'A hostel visit was requested or updated. Open Visits to review its current status and any proposed time.',
  },
  'resident.stay_started': {
    title: 'Stay started',
    body: 'A stay was started for your account. Open My Stay for its current status.',
  },
  'resident.payment_proof_submitted': {
    title: 'Rent payment proof received',
    body: 'A resident submitted a rent payment proof. Open the payment review queue to verify it against the invoice.',
  },
  'resident.payment_proof_rejected': {
    title: 'Payment proof not accepted',
    body: 'Your hostel did not accept a rent payment proof. Open My Stay to read the reason; the invoice remains unpaid.',
  },
  'resident.checked_out': {
    title: 'Checkout completed',
    body: 'Your hostel completed your checkout. Open Past Stays for the final statement; any refund is paid by the hostel directly.',
  },
  'resident.transport_requested': {
    title: 'Transport request received',
    body: 'A resident asked to join or leave a transport route. Open Transport to decide and set the effective date.',
  },
  'resident.transport_decided': {
    title: 'Transport request updated',
    body: 'Your hostel updated your transport request. Open My Stay to see the route, monthly charge and effective date.',
  },
  'resident.complaint_submitted': {
    title: 'New resident complaint',
    body: 'A resident raised a complaint. Open Complaints to assign and resolve it.',
  },
  'resident.complaint_updated': {
    title: 'Complaint updated',
    body: 'Your hostel updated your complaint. Open My Stay to see the progress; confirm it is fixed or reopen it.',
  },
  'resident.complaint_reopened': {
    title: 'Complaint reopened',
    body: 'A resident reopened a complaint because the issue remains. Open Complaints to follow up.',
  },
  'resident.review_replied': {
    title: 'Your hostel replied to your review',
    body: 'The hostel posted a public reply to your verified review.',
  },
  'support.ticket_updated': {
    title: 'Support ticket updated',
    body: 'HSM support updated your ticket. Open Help & Support to read the reply.',
  },
  'owner.verification_updated': {
    title: 'Hostel verification updated',
    body: 'HSM updated your hostel verification. Open your hostel setup to review the current status and any requested corrections.',
  },
  'resident.rent_due': {
    title: 'Rent invoice issued',
    body: 'A rent invoice was issued for your Stay. Open My Stay to review its amount and due date. Pay the hostel directly; this notice does not take payment.',
  },
  'resident.rent_overdue': {
    title: 'Rent overdue',
    body: 'A rent invoice for your Stay is past its due date and agreed grace period. Open My Stay to review the outstanding balance.',
  },
  'resident.admission_recorded': {
    title: 'Resident admission recorded',
    body: 'A resident admission was recorded. Open management Stays for its current status.',
  },
  'resident.notice_submitted': {
    title: 'Departure notice recorded',
    body: 'Your departure notice was recorded. Open My Stay to review its agreed notice period and current status.',
  },
  'resident.payment_recorded': {
    title: 'Hostel payment recorded',
    body: 'Your hostel recorded a payment. Open My Stay to review its receipt and current balance.',
  },
  'booking.submitted': {
    title: 'Booking submitted',
    body: 'Your booking was submitted. Open My Bookings for its current status.',
  },
  'booking.confirmed': {
    title: 'Booking confirmed',
    body: 'Your booking was confirmed. Open My Bookings for its current status.',
  },
  'booking.rejected': {
    title: 'Booking request rejected',
    body: 'Your booking request was rejected. Open My Bookings for details.',
  },
  'booking.cancelled': {
    title: 'Booking cancelled',
    body: 'Your booking was cancelled. Open My Bookings for its current status.',
  },
  'booking.expired': {
    title: 'Booking request expired',
    body: 'Your booking request expired. Open My Bookings for its current status.',
  },
  'booking.approved': {
    title: 'Booking approved: payment requested',
    body: 'Your booking request was approved. Pay the hostel directly using the instructions in My Bookings, then submit your payment proof before the request expires.',
  },
  'booking.payment_submitted': {
    title: 'Payment proof submitted',
    body: 'Your payment proof was submitted. The hostel will verify it before confirming your booking.',
  },
  'booking.payment_rejected': {
    title: 'Payment proof not accepted',
    body: 'The hostel could not verify your payment proof. Open My Bookings for the reason and submit a corrected proof before the request expires.',
  },
  'booking.payment_review': {
    title: 'Payment proof to review',
    body: 'A customer submitted an upfront payment proof. Open management bookings to verify it against your own payment records.',
  },
  'booking.received': {
    title: 'New booking received',
    body: 'A booking was received for your hostel. Open management bookings for its current status.',
  },
  'account.email_verified': {
    title: 'Email verified',
    body: 'Your email address has been verified.',
  },
  'account.password_reset': {
    title: 'Password reset',
    body: 'Your password has been reset and previous sessions revoked.',
  },
  'account.password_changed': {
    title: 'Password changed',
    body: 'Your password has been changed and other sessions revoked.',
  },
  'profile.review_updated': {
    title: 'Profile review updated',
    body: 'Your profile review has a new decision. Open your review history for its status. Approved identity changes require a fresh login.',
  },
  'customer.warn': {
    title: 'Platform policy warning',
    body: 'A platform policy warning was issued for your account. Follow HSM policies; contact support to request a review.',
  },
  'customer.suspend': {
    title: 'Account suspended',
    body: 'Your customer account was suspended after a policy review. Contact support to request a review.',
  },
  'customer.ban': {
    title: 'Account access restricted',
    body: 'Your customer account was banned after a policy review. Contact support to request a review.',
  },
  'customer.reinstate': {
    title: 'Account access restored',
    body: 'Your customer account access has been restored after a platform review.',
  },
  'manager.suspended': {
    title: 'Manager access suspended',
    body: 'A manager assignment has been suspended.',
  },
  'manager.reinstated': {
    title: 'Manager access restored',
    body: 'A manager assignment has been reinstated.',
  },
  'manager.deactivated': {
    title: 'Manager access ended',
    body: 'A manager assignment has been deactivated.',
  },
};
export function renderNotification(event: NotificationEvent) {
  return {
    ...templates[notificationEventSchema.parse(event)],
    type: event,
    data: {},
    deepLink: null,
  };
}
