import { z } from 'zod';
import {
  DomainError,
  invoiceReissueInputSchema,
  invoiceReissueResultSchema,
  paymentReversalInputSchema,
  newResidentPaymentInputSchema,
  recordExternalPaymentInputSchema,
  recordedResidentPaymentSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { StayPaymentRepository } from './payment.repository.js';
export class StayPaymentService {
  constructor(
    private readonly repository: StayPaymentRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  async record(
    actor: Actor,
    key: unknown,
    inputBranch: unknown,
    inputStay: unknown,
    body: unknown,
  ) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      stayId = stayIdentifierSchema.parse(inputStay),
      commandId = stayIdentifierSchema.parse(key),
      payment = recordExternalPaymentInputSchema.parse(body);
    try {
      const context = await this.repository.context(actor, branchId, stayId);
      return await this.idempotency.withStore(context.store).execute(
        { actor, key: commandId, endpoint: 'POST Stay external payment', status: 201 },
        { branchId, stayId },
        payment,
        recordedResidentPaymentSchema.refine((value) => value.amountPaisa === payment.amountPaisa),
        (tx) => this.repository.authorize(tx, actor, branchId, stayId, context.userId),
        () => {
          // CHG-055: validate new collections after authorized historical replay lookup.
          if (!newResidentPaymentInputSchema.safeParse(payment).success)
            throw new DomainError(
              'VALIDATION_FAILED',
              400,
              'Payment exceeds the selected bills and security deposit total',
            );
          return this.repository.record(
            requireTransaction(),
            actor,
            branchId,
            stayId,
            context.userId,
            commandId,
            payment,
          );
        },
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Payment response unavailable');
      return inventoryFailure(error);
    }
  }
  async reverse(
    actor: Actor,
    key: unknown,
    inputBranch: unknown,
    inputStay: unknown,
    inputPayment: unknown,
    body: unknown,
  ) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      stayId = stayIdentifierSchema.parse(inputStay),
      paymentId = stayIdentifierSchema.parse(inputPayment),
      reversal = paymentReversalInputSchema.parse(body);
    try {
      const context = await this.repository.context(actor, branchId, stayId);
      return await this.idempotency.withStore(context.store).execute(
        {
          actor,
          key: stayIdentifierSchema.parse(key),
          endpoint: 'POST payment reversal',
          status: 201,
        },
        { branchId, stayId, paymentId },
        reversal,
        paymentReversalResultSchema,
        (tx) => this.repository.authorize(tx, actor, branchId, stayId, context.userId),
        () =>
          this.repository.reverse(
            requireTransaction(),
            actor,
            branchId,
            stayId,
            paymentId,
            reversal,
          ),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Reversal response unavailable');
      return inventoryFailure(error);
    }
  }
  async reissue(
    actor: Actor,
    key: unknown,
    inputBranch: unknown,
    inputStay: unknown,
    inputInvoice: unknown,
    body: unknown,
  ) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      stayId = stayIdentifierSchema.parse(inputStay),
      invoiceId = stayIdentifierSchema.parse(inputInvoice),
      reissue = invoiceReissueInputSchema.parse(body);
    try {
      const context = await this.repository.context(actor, branchId, stayId);
      return await this.idempotency.withStore(context.store).execute(
        { actor, key: stayIdentifierSchema.parse(key), endpoint: 'POST bill reissue', status: 201 },
        { branchId, stayId, invoiceId },
        reissue,
        invoiceReissueResultSchema,
        (tx) => this.repository.authorize(tx, actor, branchId, stayId, context.userId),
        () =>
          this.repository.reissue(
            requireTransaction(),
            actor,
            branchId,
            stayId,
            invoiceId,
            reissue,
          ),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Reissue response unavailable');
      return inventoryFailure(error);
    }
  }
}

const paymentReversalResultSchema = z
  .object({
    reversalId: stayIdentifierSchema,
    paymentId: stayIdentifierSchema,
    receiptId: stayIdentifierSchema,
  })
  .strict();
