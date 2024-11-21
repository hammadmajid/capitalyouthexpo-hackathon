import { z } from 'zod';
import {
  bookingDocumentSubmissionSchema,
  bookingDocumentReviewSchema,
  ownBookingDocumentSchema,
  ownerBookingDocumentSchema,
  managementPageSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { inventoryFailure } from './errors.js';
import { BookingDocumentRepository } from './documents.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingDocumentService {
  constructor(
    private readonly repository: BookingDocumentRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  own(actor: Actor, branchId: string, query: unknown) {
    return this.repository.own(actor, id.parse(branchId), managementPageSchema.parse(query));
  }
  queue(actor: Actor, branchId: string, query: unknown) {
    return this.repository.queue(actor, id.parse(branchId), managementPageSchema.parse(query));
  }
  submit(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = bookingDocumentSubmissionSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /me/booking-documents/:branchId', status: 201 },
        { branch },
        input,
        ownBookingDocumentSchema,
        (transaction) => this.repository.authorizeSubmit(transaction, actor, branch),
        () => this.repository.submit(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
  review(actor: Actor, key: string, branchId: string, documentId: string, body: unknown) {
    const branch = id.parse(branchId),
      document = id.parse(documentId),
      input = bookingDocumentReviewSchema.parse(body);
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: 'POST /branches/:branchId/booking-documents/:documentId/review',
          status: 200,
        },
        { branch, document },
        input,
        ownerBookingDocumentSchema,
        (transaction) => this.repository.authorizeOwner(transaction, actor, branch),
        () => this.repository.review(requireTransaction(), actor, branch, document, input),
      )
      .catch(inventoryFailure);
  }
}
