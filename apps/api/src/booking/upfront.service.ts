import { z } from 'zod';
import type { Database } from '@hsm/db';
import {
  DomainError,
  bookingActionInputSchema,
  bookingProofInputSchema,
  bookingProofReviewSchema,
  bookingSummarySchema,
  downloadResponseSchema,
  paymentInstructionInputSchema,
  paymentInstructionSchema,
  upfrontSettingsSchema,
} from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { lockActor } from '../auth/actor-lock.js';
import type { BookingActionRepository } from './actions.repository.js';
import type { BookingUpfrontRepository } from './upfront.repository.js';
import type { PaymentInstructionRepository } from './payment-instructions.repository.js';
import type { UpfrontSettingsRepository } from './upfront-settings.repository.js';
import { inventoryFailure } from './errors.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingUpfrontService {
  constructor(
    private readonly database: Database,
    private readonly actions: BookingActionRepository,
    private readonly upfront: BookingUpfrontRepository,
    private readonly instructions: PaymentInstructionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly storage: Pick<PrivateStorage, 'presignDownload'>,
    private readonly settings: UpfrontSettingsRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  readSettings(actor: Actor, branchId: string) {
    return this.settings.read(actor, identifier.parse(branchId));
  }
  updateSettings(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      input = upfrontSettingsSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'upfront settings update', status: 200 },
      { branch },
      input,
      upfrontSettingsSchema,
      async (transaction) =>
        Boolean(await this.instructions.authorizeOwner(transaction, actor, branch)),
      () => this.settings.update(requireTransaction(), actor, branch, input),
    );
  }
  // BKG-002 / SRS v2.11: staff approval opens payment for an upfront request.
  approve(actor: Actor, key: string, branchId: string, bookingId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      id = identifier.parse(bookingId),
      input = bookingActionInputSchema.parse(body);
    return this.actions
      .confirmationContext(actor, id, branch)
      .then((context) =>
        this.idempotency.withStore(context.store).execute(
          { actor, key, endpoint: 'booking approve', status: 200 },
          { id, branch },
          input,
          bookingSummarySchema,
          (transaction) => this.actions.authorize(transaction, actor, branch),
          () =>
            this.actions.approve(
              requireTransaction(),
              actor,
              branch,
              id,
              input.reason,
              context.customerUserId,
            ),
        ),
      )
      .catch(inventoryFailure);
  }
  submitProof(actor: Actor, key: string, bookingId: string, body: unknown) {
    const id = identifier.parse(bookingId),
      input = bookingProofInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'booking payment proof', status: 201 },
        { id },
        input,
        bookingSummarySchema,
        (transaction) => this.actions.authorizeCustomer(transaction, actor, id),
        () => this.upfront.submit(requireTransaction(), actor, id, input),
      )
      .catch(inventoryFailure);
  }
  review(
    actor: Actor,
    key: string,
    branchId: string,
    bookingId: string,
    proofId: string,
    body: unknown,
  ) {
    const branch = identifier.parse(branchId),
      id = identifier.parse(bookingId),
      proof = identifier.parse(proofId),
      input = bookingProofReviewSchema.parse(body);
    return this.actions
      .confirmationContext(actor, id, branch)
      .then((context) =>
        this.idempotency.withStore(context.store).execute(
          { actor, key, endpoint: 'booking payment review', status: 200 },
          { id, branch, proof },
          input,
          bookingSummarySchema,
          (transaction) => this.upfront.authorizeReviewer(transaction, actor, branch),
          () =>
            this.upfront.review(
              requireTransaction(),
              actor,
              branch,
              id,
              proof,
              input,
              context.customerUserId,
            ),
        ),
      )
      .catch(inventoryFailure);
  }
  proofDownload(actor: Actor, branchId: string, bookingId: string, proofId: string) {
    const branch = identifier.parse(branchId),
      id = identifier.parse(bookingId),
      proof = identifier.parse(proofId);
    return this.database.transaction(async (transaction) => {
      const file = await this.upfront.proofFile(transaction, actor, branch, id, proof);
      let url: string;
      try {
        url = await this.storage.presignDownload(file.objectKey, file.id, file.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      await lockActor(transaction, actor, this.clock);
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
  listInstructions(actor: Actor, branchId: string) {
    return this.instructions.list(actor, identifier.parse(branchId));
  }
  customerInstructions(actor: Actor, bookingId: string) {
    return this.instructions.forCustomer(actor, identifier.parse(bookingId));
  }
  createInstruction(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      input = paymentInstructionInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'payment instruction create', status: 201 },
      { branch },
      input,
      paymentInstructionSchema,
      async (transaction) =>
        Boolean(await this.instructions.authorizeOwner(transaction, actor, branch)),
      () => this.instructions.create(requireTransaction(), actor, branch, input),
    );
  }
  archiveInstruction(actor: Actor, key: string, branchId: string, instructionId: string) {
    const branch = identifier.parse(branchId),
      id = identifier.parse(instructionId);
    return this.idempotency.execute(
      { actor, key, endpoint: 'payment instruction archive', status: 200 },
      { branch, id },
      {},
      paymentInstructionSchema,
      async (transaction) =>
        Boolean(await this.instructions.authorizeOwner(transaction, actor, branch)),
      () => this.instructions.archive(requireTransaction(), actor, branch, id),
    );
  }
}
