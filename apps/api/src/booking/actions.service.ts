import { z } from 'zod';
import {
  bookingActionInputSchema,
  bookingSummarySchema,
  branchBookingPageQuerySchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { BookingActionRepository } from './actions.repository.js';
import { inventoryFailure } from './errors.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingActionService {
  constructor(
    private readonly repository: BookingActionRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  list(actor: Actor, branchId: string, page: unknown) {
    return this.repository.list(
      actor,
      identifier.parse(branchId),
      branchBookingPageQuerySchema.parse(page),
    );
  }
  action(
    actor: Actor,
    key: string,
    bookingId: string,
    action: 'confirm' | 'reject' | 'cancel',
    body: unknown,
    branchId?: string,
  ) {
    const id = identifier.parse(bookingId),
      branch = branchId ? identifier.parse(branchId) : undefined;
    const input = bookingActionInputSchema.parse(body);
    const execute = (idempotency: IdempotencyService, customerUserId?: string) =>
      idempotency.execute(
        { actor, key, endpoint: 'booking ' + action, status: 200 },
        { id, ...(branch ? { branch } : {}) },
        input,
        bookingSummarySchema,
        async (transaction) => {
          if (branch) return this.repository.authorize(transaction, actor, branch);
          if (action !== 'cancel') return false;
          return this.repository.authorizeCustomer(transaction, actor, id);
        },
        async () => {
          const transaction = requireTransaction();
          if (action === 'cancel')
            return this.repository.cancel(transaction, actor, id, input.reason, branch);
          if (!branch) throw new Error('Management branch required');
          if (action === 'confirm') {
            if (!customerUserId) throw new Error('Confirmation participant context required');
            return this.repository.confirm(
              transaction,
              actor,
              branch,
              id,
              input.reason,
              customerUserId,
            );
          }
          return this.repository.reject(transaction, actor, branch, id, input.reason);
        },
      );
    const result =
      action === 'confirm' && branch
        ? this.repository
            .confirmationContext(actor, id, branch)
            .then((context) =>
              execute(this.idempotency.withStore(context.store), context.customerUserId),
            )
        : execute(this.idempotency);
    return result.catch(inventoryFailure);
  }
}
