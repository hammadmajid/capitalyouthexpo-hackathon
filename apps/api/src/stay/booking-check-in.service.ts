import { z } from 'zod';
import {
  DomainError,
  bookingAdmissionCommandSchema,
  bookingAdmissionResultSchema,
  bookingAdmissionPreviewSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { BookingCheckInRepository } from './booking-check-in.repository.js';
import { splitBookingCnic } from './resident-cnic.js';
export class BookingCheckInService {
  constructor(
    private readonly database: Database,
    private readonly repository: BookingCheckInRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  // STAY-001 / BKG-004: read-only review of the exact agreement terms check-in will use.
  preview(actor: Actor, inputBranch: unknown, inputBooking: unknown, inputPolicy: unknown) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      bookingId = stayIdentifierSchema.parse(inputBooking),
      policyVersionId =
        inputPolicy === undefined ? undefined : stayIdentifierSchema.parse(inputPolicy);
    return this.database.transaction(async (tx) => {
      await this.repository.authorize(tx, actor, branchId);
      const { terms } = await this.repository.terms(tx, branchId, bookingId, policyVersionId);
      const cnicOnFile = await this.repository.cnicOnFile(tx, branchId, bookingId);
      return bookingAdmissionPreviewSchema.parse({ branchId, bookingId, terms, cnicOnFile });
    });
  }
  async checkIn(
    actor: Actor,
    key: unknown,
    inputBranch: unknown,
    inputBooking: unknown,
    body: unknown,
  ) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      bookingId = stayIdentifierSchema.parse(inputBooking),
      commandId = stayIdentifierSchema.parse(key),
      command = bookingAdmissionCommandSchema.parse(body);
    const response = bookingAdmissionResultSchema.refine(
      (value) => value.branchId === branchId && value.bookingId === bookingId,
    );
    try {
      const context = await this.repository.context(actor, branchId, bookingId);
      return await this.idempotency.withStore(context.store).execute(
        { actor, key: commandId, endpoint: 'POST booking check-in', status: 201 },
        { branchId, bookingId },
        { ...splitBookingCnic(command).command, ...this.repository.fingerprint(command) },
        response,
        (tx) => this.repository.authorize(tx, actor, branchId),
        () =>
          this.repository.checkIn(
            requireTransaction(),
            actor,
            branchId,
            bookingId,
            command,
            context.customerUserId,
          ),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Check-in response unavailable');
      return inventoryFailure(error);
    }
  }
}
