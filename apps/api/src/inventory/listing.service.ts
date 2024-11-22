import { z } from 'zod';
import {
  amenityCatalogQuerySchema,
  customAmenityCommandSchema,
  customAmenitySchema,
  listingPreconditionSchema,
  listingSettingsInputSchema,
  privateListingSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { ListingRepository } from './listing.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class ListingService {
  constructor(
    private readonly repository: ListingRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return this.repository.read(actor, id.parse(branchId));
  }
  catalog(query: unknown) {
    return this.repository.catalog(amenityCatalogQuerySchema.parse(query));
  }
  customCatalog(actor: Actor, branchId: string, query: unknown) {
    return this.repository
      .customAmenities()
      .read(actor, id.parse(branchId), amenityCatalogQuerySchema.parse(query));
  }
  saveCustom(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = customAmenityCommandSchema.parse(body);
    const repository = this.repository.customAmenities();
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /branches/:branchId/listing/custom-amenities', status: 200 },
      { branch },
      input,
      customAmenitySchema,
      async (tx) => {
        await repository.authorize(tx, actor, branch);
        return true;
      },
      () => repository.write(requireTransaction(), actor, branch, input),
    );
  }
  save(actor: Actor, key: string, branchId: string, ifMatch: unknown, body: unknown) {
    const branch = id.parse(branchId),
      expectedVersion = listingPreconditionSchema.parse(ifMatch),
      input = listingSettingsInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'PUT /branches/:branchId/listing', status: 200 },
      { branch },
      { expectedVersion, input },
      privateListingSchema,
      async (transaction) => {
        await this.repository.authorize(transaction, actor, branch, 'listing_edit');
        return true;
      },
      () => this.repository.save(requireTransaction(), actor, branch, expectedVersion, input),
    );
  }
}
