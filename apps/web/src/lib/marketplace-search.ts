import { z } from 'zod';
import {
  marketplaceQuerySchema,
  marketplaceCategorySchema,
  marketplaceSortSchema,
  type MarketplaceQuery,
} from '@hsm/contracts';
import { inventoryPaisa } from './inventory-money';
const fieldsSchema = z
  .object({
    q: z.string().trim().max(120),
    category: z.union([z.literal(''), marketplaceCategorySchema]),
    minimum: z.string().max(17),
    maximum: z.string().max(17),
    moveIn: z.string().max(10),
    moveOut: z.string().max(10),
    available: z.boolean(),
    deposit: z.string().max(17).default(''),
    capacity: z.string().max(2).default(''),
    optionKind: z.enum(['', 'bed', 'room']).default(''),
    sort: z.union([z.literal(''), marketplaceSortSchema]).default(''),
  })
  .strict();
export const emptyMarketplaceSearch = {
  q: '',
  category: '',
  minimum: '',
  maximum: '',
  moveIn: '',
  moveOut: '',
  available: false,
  deposit: '',
  capacity: '',
  optionKind: '' as '' | 'bed' | 'room',
  sort: '' as '' | NonNullable<MarketplaceQuery['sort']>,
};
export function marketplaceSearch(
  input: unknown,
  institution?: { universityPlaceId: string; radiusMeters: number },
): MarketplaceQuery {
  const value = fieldsSchema.parse(input);
  return marketplaceQuerySchema.parse({
    q: value.q,
    ...(value.category ? { category: value.category } : {}),
    ...(value.minimum.trim() ? { minimumRentPaisa: inventoryPaisa(value.minimum) } : {}),
    ...(value.maximum.trim() ? { maximumRentPaisa: inventoryPaisa(value.maximum) } : {}),
    ...(value.moveIn ? { moveInDate: value.moveIn } : {}),
    ...(value.moveOut ? { moveOutDate: value.moveOut } : {}),
    availableOnly: String(value.available),
    // p.13: deposit ceiling, seater size, option kind and organic sort.
    ...(value.deposit.trim() ? { maximumDepositPaisa: inventoryPaisa(value.deposit) } : {}),
    ...(value.capacity.trim() ? { capacity: value.capacity.trim() } : {}),
    ...(value.optionKind ? { optionKind: value.optionKind } : {}),
    ...(value.sort ? { sort: value.sort } : {}),
    ...(institution ?? {}),
    limit: 20,
  });
}
