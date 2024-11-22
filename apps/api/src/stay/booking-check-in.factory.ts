import type { Database } from '@hsm/db';
import type { IdempotencyService } from '../idempotency/service.js';
import { BookingCheckInRepository } from './booking-check-in.repository.js';
import { BookingCheckInService } from './booking-check-in.service.js';
import type { CnicProtector } from './resident-cnic.js';
export function bookingCheckInService(
  database: Database,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
  protect?: CnicProtector,
) {
  return new BookingCheckInService(
    database,
    new BookingCheckInRepository(database, clock, protect),
    idempotency,
  );
}
