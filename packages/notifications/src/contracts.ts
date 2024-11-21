import { z } from 'zod';
import {
  visitLifecyclePayloadSchema,
  waitlistLifecyclePayloadSchema,
  chatLifecyclePayloadSchema,
  bookingLifecycleEventSchema,
  bookingLifecyclePayloadSchema,
  residentLifecyclePayloadSchema,
  residentRentPayloadSchema,
  type notificationOutbox,
} from '@hsm/db';
export type NotificationMessage = Pick<
  typeof notificationOutbox.$inferSelect,
  'id' | 'eventType' | 'channel' | 'recipientUserId' | 'payload' | 'leaseToken' | 'leaseExpiresAt'
>;
export const notificationEventSchema = z.enum([
  'chat.message.created',
  'waitlist.vacancy',
  'visit.changed',
  'visit.follow_up',
  'account.email_verified',
  'account.password_reset',
  'account.password_changed',
  'manager.suspended',
  'manager.reinstated',
  'manager.deactivated',
  ...bookingLifecycleEventSchema.options,
  'booking.received',
  // SRS v2.11: staff review notice for a submitted upfront proof.
  'booking.payment_review',
  'resident.payment_recorded',
  'resident.notice_submitted',
  'resident.stay_started',
  'resident.admission_recorded',
  // RENT-001 / RB-002: resident rent due and overdue (SRS notification matrix).
  'resident.rent_due',
  'resident.rent_overdue',
  // PAY-004..006: resident rent proof received (Owner) and rejected (resident).
  'resident.payment_proof_submitted',
  'resident.payment_proof_rejected',
  // OUT-006: checkout completed; the final statement is available.
  'resident.checked_out',
  // SERV-002 / CMP-004 / REV-005 (Phase 9): service, complaint and review notices.
  'resident.transport_requested',
  'resident.transport_decided',
  'resident.complaint_submitted',
  'resident.complaint_updated',
  'resident.complaint_reopened',
  'resident.review_replied',
  // ADM-009: platform support replied or changed the ticket status.
  'support.ticket_updated',
  'owner.verification_updated',
  'profile.review_updated',
  'customer.warn',
  'customer.suspend',
  'customer.ban',
  'customer.reinstate',
]);
export const notificationJobSchema = z
  .object({
    event: notificationEventSchema,
    operationId: z.string().uuid(),
  })
  .strict();
export const enqueueNotificationSchema = notificationJobSchema
  .extend({
    userId: z.string().uuid(),
  })
  .strict();
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type EnqueueNotification = z.infer<typeof enqueueNotificationSchema>;
export const notificationLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('notification.create'),
    channel: z.literal('in_app'),
    recipientUserId: z.string().uuid(),
    payload: notificationJobSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type NotificationLease = z.infer<typeof notificationLeaseSchema>;
export class InvalidNotificationJob extends Error {
  constructor() {
    super('INVALID_NOTIFICATION_JOB');
  }
}

export const bookingLifecycleLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('booking.lifecycle'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: bookingLifecyclePayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type BookingLifecycleLease = z.infer<typeof bookingLifecycleLeaseSchema>;
export const residentLifecycleLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('resident.lifecycle'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: residentLifecyclePayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type ResidentLifecycleLease = z.infer<typeof residentLifecycleLeaseSchema>;
export const residentRentLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('resident.rent'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: residentRentPayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type ResidentRentLease = z.infer<typeof residentRentLeaseSchema>;
export const visitLifecycleLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('visit.lifecycle'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: visitLifecyclePayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type VisitLifecycleLease = z.infer<typeof visitLifecycleLeaseSchema>;
export const waitlistLifecycleLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('waitlist.lifecycle'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: waitlistLifecyclePayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type WaitlistLifecycleLease = z.infer<typeof waitlistLifecycleLeaseSchema>;
export const chatLifecycleLeaseSchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.literal('chat.lifecycle'),
    channel: z.literal('in_app'),
    recipientUserId: z.null(),
    payload: chatLifecyclePayloadSchema,
    leaseToken: z.string().uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();
export type ChatLifecycleLease = z.infer<typeof chatLifecycleLeaseSchema>;
export const notificationDeliveryLeaseSchema = z.discriminatedUnion('eventType', [
  waitlistLifecycleLeaseSchema,
  chatLifecycleLeaseSchema,
  notificationLeaseSchema,
  bookingLifecycleLeaseSchema,
  residentLifecycleLeaseSchema,
  residentRentLeaseSchema,
  visitLifecycleLeaseSchema,
]);
