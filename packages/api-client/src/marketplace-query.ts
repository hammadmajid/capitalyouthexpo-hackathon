import type { MarketplaceQuery } from '@hsm/contracts';
export function marketplaceWireQuery(input: MarketplaceQuery) {
  return {
    limit: input.limit,
    availableOnly: input.availableOnly ? ('true' as const) : ('false' as const),
    ...(input.q !== undefined ? { q: input.q } : {}),
    ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
    ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
    ...(input.universityPlaceId !== undefined
      ? { universityPlaceId: input.universityPlaceId }
      : {}),
    ...(input.radiusMeters !== undefined ? { radiusMeters: input.radiusMeters } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.minimumRentPaisa !== undefined ? { minimumRentPaisa: input.minimumRentPaisa } : {}),
    ...(input.maximumRentPaisa !== undefined ? { maximumRentPaisa: input.maximumRentPaisa } : {}),
    ...(input.moveInDate !== undefined ? { moveInDate: input.moveInDate } : {}),
    ...(input.moveOutDate !== undefined ? { moveOutDate: input.moveOutDate } : {}),
    ...(input.west !== undefined ? { west: input.west } : {}),
    ...(input.east !== undefined ? { east: input.east } : {}),
    ...(input.south !== undefined ? { south: input.south } : {}),
    ...(input.north !== undefined ? { north: input.north } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.maximumDepositPaisa !== undefined
      ? { maximumDepositPaisa: input.maximumDepositPaisa }
      : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.optionKind !== undefined ? { optionKind: input.optionKind } : {}),
    ...(input.ids !== undefined ? { ids: input.ids.join(',') } : {}),
    ...(input.amenities !== undefined ? { amenities: input.amenities.join(',') } : {}),
  };
}
