import type {
  WaitlistLifecycleLease,
  ChatLifecycleLease,
  VisitLifecycleLease,
  NotificationLease,
  BookingLifecycleLease,
  ResidentLifecycleLease,
  ResidentRentLease,
} from './contracts.js';
export interface NotificationStore {
  publishChat?(lease: ChatLifecycleLease, now: Date): Promise<boolean>;
  publishWaitlist?(lease: WaitlistLifecycleLease, now: Date): Promise<boolean>;
  publishVisit?(lease: VisitLifecycleLease, now: Date): Promise<boolean>;
  publishResident(lease: ResidentLifecycleLease, now: Date): Promise<boolean>;
  publishRent?(lease: ResidentRentLease, now: Date): Promise<boolean>;
  publishBooking(lease: BookingLifecycleLease, now: Date): Promise<boolean>;
  publish(lease: NotificationLease, now: Date): Promise<boolean>;
}
