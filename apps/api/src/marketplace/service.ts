import { z } from 'zod';
import {
  marketplaceQuerySchema,
  managementPageSchema,
  publicInventoryQuerySchema,
  inventoryPageKindSchema,
} from '@hsm/contracts';
import { MarketplaceRepository } from './repository.js';
import { PublicListingMedia } from './media.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const institutionQuery = managementPageSchema.extend({
  q: z.string().trim().max(120).optional(),
  radiusMeters: z.coerce.number().int().min(100).max(200000).optional(),
});
export class MarketplaceService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly media: PublicListingMedia,
  ) {}
  list(query: unknown) {
    return this.repository.list(marketplaceQuerySchema.parse(query));
  }
  inventoryPage(branchId: string, kind: unknown, parentId: string | undefined, query: unknown) {
    const branch = id.parse(branchId),
      input = publicInventoryQuerySchema.parse(query),
      pageKind = inventoryPageKindSchema.parse(kind);
    const reader = this.repository.inventoryPages;
    if (pageKind === 'room_types') return reader.types(branch, input);
    const parent = id.parse(parentId);
    return pageKind === 'rooms'
      ? reader.rooms(branch, parent, input)
      : reader.beds(branch, parent, input);
  }
  details(branchId: string, query: unknown) {
    return this.repository.overview(id.parse(branchId), marketplaceQuerySchema.parse(query));
  }
  institutions(query: unknown) {
    const input = institutionQuery.parse(query);
    return this.repository.institutions(
      { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) },
      input.q,
      input.radiusMeters,
    );
  }
  image(mediaId: string) {
    return this.media.read(id.parse(mediaId));
  }
}
