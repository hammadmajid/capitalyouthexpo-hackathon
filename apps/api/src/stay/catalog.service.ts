import { z } from 'zod';
import {
  DomainError,
  billingCatalogInputSchema,
  billingCatalogArchiveSchema,
  billingCatalogQuerySchema,
  billingCatalogPageSchema,
  billingCatalogEntrySchema,
  stayIdentifierSchema,
  inventoryPageSequenceIsValid,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { BillingCatalogRepository } from './catalog.repository.js';
import { catalogResult } from './catalog.projection.js';
const targetSchema = z
  .object({ branchId: stayIdentifierSchema, catalogId: stayIdentifierSchema })
  .strict();
export class BillingCatalogService {
  constructor(
    private readonly repository: BillingCatalogRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  async read(actor: Actor, branchId: unknown, query: unknown = {}) {
    const scope = stayIdentifierSchema.parse(branchId),
      input = billingCatalogQuerySchema.parse(query);
    return catalogResult(
      billingCatalogPageSchema.refine(
        (value) =>
          value.branchId === scope &&
          value.includeArchived === (input.includeArchived === 'true') &&
          value.data.length <= input.limit &&
          inventoryPageSequenceIsValid(value.data, input.cursor),
      ),
      await this.repository.read(actor, scope, input),
    );
  }
  create(actor: Actor, key: string, branchId: unknown, body: unknown) {
    const scope = { branchId: stayIdentifierSchema.parse(branchId) },
      input = billingCatalogInputSchema.parse(body),
      commandKey = stayIdentifierSchema.parse(key);
    return this.idempotency
      .execute(
        { actor, key: commandKey, endpoint: 'POST branch charge-catalog', status: 201 },
        scope,
        input,
        billingCatalogEntrySchema.refine(
          (value) =>
            value.branchId === scope.branchId &&
            value.code === input.code &&
            value.name === input.name &&
            value.unitLabel === input.unitLabel &&
            value.unitAmountPaisa === input.unitAmountPaisa &&
            value.archivedAt === null,
        ),
        (transaction) => this.repository.authorizeCreate(transaction, actor, scope.branchId),
        () => this.repository.create(requireTransaction(), actor, scope.branchId, input),
      )
      .catch(catalogCommandFailure);
  }
  archive(actor: Actor, key: string, target: unknown, body: unknown) {
    const scope = targetSchema.parse(target),
      input = billingCatalogArchiveSchema.parse(body),
      commandKey = stayIdentifierSchema.parse(key);
    return this.idempotency
      .execute(
        { actor, key: commandKey, endpoint: 'POST branch charge-catalog archive', status: 200 },
        scope,
        input,
        billingCatalogEntrySchema.refine(
          (value) =>
            value.branchId === scope.branchId &&
            value.id === scope.catalogId &&
            value.archivedAt !== null,
        ),
        (transaction) =>
          this.repository.authorizeArchive(transaction, actor, scope.branchId, scope.catalogId),
        () =>
          this.repository.archive(
            requireTransaction(),
            actor,
            scope.branchId,
            scope.catalogId,
            input.reason,
          ),
      )
      .catch(catalogCommandFailure);
  }
}

function catalogCommandFailure(error: unknown): never {
  // SEC-003: request inputs are parsed before execution; response-schema failures are server faults.
  if (error instanceof z.ZodError)
    throw new DomainError('INTERNAL', 500, 'Catalogue response unavailable');
  return inventoryFailure(error);
}
