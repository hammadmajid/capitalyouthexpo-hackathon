import { z } from 'zod';
import { stayRangeSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { listMarketplace, marketplaceInstitutions } from './marketplace.js';
import { listPublicInventoryRoomTypes } from './public-inventory-pages.js';
import { ClientFailure } from './result.js';
export const comparisonInputSchema = z
  .object({
    ids: z
      .array(
        z
          .string()
          .uuid()
          .transform((value) => value.toLowerCase()),
      )
      .min(2)
      .max(4)
      .refine((value) => new Set(value).size === value.length),
    range: stayRangeSchema.optional(),
    destinationId: z.string().uuid().optional(),
  })
  .strict();
export type ComparisonInput = z.infer<typeof comparisonInputSchema>;
export async function readHostelComparison(client: ApiClient, input: ComparisonInput) {
  const parsed = comparisonInputSchema.parse(input),
    dates = parsed.range ?? {};
  const [listings, pages, destinations] = await Promise.all([
    listMarketplace(client, { ids: parsed.ids, limit: 4, ...dates }),
    Promise.all(
      parsed.ids.map((branchId) =>
        listPublicInventoryRoomTypes(client, branchId, { limit: 20, ...dates }),
      ),
    ),
    parsed.destinationId ? marketplaceInstitutions(client, { limit: 100 }) : undefined,
  ]);
  const destination = destinations?.data.find((row) => row.id === parsed.destinationId);
  if (parsed.destinationId && !destination) throw new ClientFailure('INVALID_RESPONSE');
  if (
    listings.nextCursor !== null ||
    listings.data.length !== parsed.ids.length ||
    new Set(listings.data.map((listing) => listing.branchId)).size !== parsed.ids.length ||
    listings.data.some((listing) => !parsed.ids.includes(listing.branchId))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return parsed.ids.map((branchId, index) => {
    const listing = listings.data.find((row) => row.branchId === branchId),
      roomTypes = pages[index];
    if (!listing || !roomTypes || roomTypes.branchId !== branchId)
      throw new ClientFailure('INVALID_RESPONSE');
    return {
      listing: {
        ...listing,
        distanceMeters: destination ? straightLineDistance(listing, destination) : null,
      },
      roomTypes,
    };
  });
}
export type HostelComparison = Awaited<ReturnType<typeof readHostelComparison>>;
function straightLineDistance(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const radians = (value: number) => (value * Math.PI) / 180,
    latitude = radians(to.latitude - from.latitude),
    longitude = radians(to.longitude - from.longitude),
    term =
      Math.sin(latitude / 2) ** 2 +
      Math.cos(radians(from.latitude)) *
        Math.cos(radians(to.latitude)) *
        Math.sin(longitude / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, term)), Math.sqrt(Math.max(0, 1 - term)));
}
