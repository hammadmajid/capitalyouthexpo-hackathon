import { z } from 'zod';
import {
  quoteInputSchema,
  holdInputSchema,
  createBookingInputSchema,
  managementPageSchema,
  bookingSummarySchema,
  holdResponseSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { BookingRepository } from './repository.js';
import { inventoryFailure } from './errors.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingService {
  constructor(
    private readonly repository: BookingRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  quote(branchId: string, body: unknown) {
    return this.repository.quote(id.parse(branchId), quoteInputSchema.parse(body));
  }
  list(actor: Actor, page: unknown) {
    return this.repository.list(actor, managementPageSchema.parse(page));
  }
  hold(actor: Actor, key: string, branchId: string, body: unknown) {
    const input = holdInputSchema.parse(body),
      branch = id.parse(branchId);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /marketplace/:branchId/holds', status: 201 },
        { branchId: branch },
        input,
        holdResponseSchema,
        (transaction) => this.repository.authorize(transaction, actor, branch),
        () => this.repository.hold(requireTransaction(), actor, branch, input.quote),
      )
      .catch(inventoryFailure);
  }
  create(actor: Actor, key: string, branchId: string, body: unknown) {
    const input = createBookingInputSchema.parse(body),
      branch = id.parse(branchId);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /marketplace/:branchId/bookings', status: 201 },
        { branchId: branch },
        input,
        bookingSummarySchema,
        (transaction) => this.repository.authorize(transaction, actor, branch),
        () => this.repository.create(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
}
