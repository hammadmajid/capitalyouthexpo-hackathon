import { expect, it } from 'vitest';
import {
  decodeMarketplaceSortCursor,
  encodeMarketplaceSortCursor,
  marketplaceSortCursorSchema,
} from './marketplace-sort.js';
import { marketplacePageSchema, marketplaceQuerySchema } from './marketplace.js';
const id = '019a1234-1234-7123-8123-123456789abc',
  place = '019a1234-1234-7123-8123-123456789abd';
it('p.13: sort continuations are canonical integer keysets bound to their sort', () => {
  const cursor = encodeMarketplaceSortCursor('recommended', [1, 3, -2], id.toUpperCase());
  expect(cursor).toBe('recommended:1,3,-2:' + id);
  expect(decodeMarketplaceSortCursor(cursor)).toEqual({
    sort: 'recommended',
    keys: [1, 3, -2],
    id,
  });
  expect(decodeMarketplaceSortCursor('price_asc:9007199254740992:' + id).keys).toEqual([2 ** 53]);
  for (const value of [
    'price_asc:1,2:' + id,
    'recommended:1:' + id,
    'rating:1:' + id,
    'price_asc:01:' + id,
    'price_asc:1.5:' + id,
    'price_asc:1:not-a-uuid',
    'price_asc:99999999999999999:' + id,
  ])
    expect(marketplaceSortCursorSchema.safeParse(value).success).toBe(false);
});
it('p.13: new filters are bounded and sorted continuations cannot switch sort or identity order', () => {
  expect(
    marketplaceQuerySchema.parse({
      maximumDepositPaisa: '500000',
      capacity: '3',
      optionKind: 'bed',
      sort: 'price_desc',
      cursor: 'price_desc:1800000:' + id,
    }),
  ).toMatchObject({
    maximumDepositPaisa: 500000,
    capacity: 3,
    optionKind: 'bed',
    sort: 'price_desc',
  });
  for (const input of [
    { capacity: '0' },
    { capacity: '65' },
    { maximumDepositPaisa: '-1' },
    { optionKind: 'suite' },
    { sort: 'rating' },
    { sort: 'price_asc', cursor: 'price_desc:1:' + id },
    { sort: 'price_asc', cursor: id },
    { cursor: 'price_asc:1:' + id },
    { sort: 'nearest' },
    { sort: 'most_available' },
  ])
    expect(marketplaceQuerySchema.safeParse(input).success).toBe(false);
  expect(
    marketplaceQuerySchema.safeParse({
      sort: 'nearest',
      universityPlaceId: place,
      radiusMeters: '3000',
    }).success,
  ).toBe(true);
  expect(
    marketplaceQuerySchema.safeParse({
      sort: 'most_available',
      moveInDate: '2026-11-01',
      moveOutDate: '2026-12-01',
    }).success,
  ).toBe(true);
  expect(
    marketplacePageSchema.parse({ data: [], nextCursor: 'nearest:120:' + id }).nextCursor,
  ).toBe('nearest:120:' + id);
  expect(marketplacePageSchema.safeParse({ data: [], nextCursor: 'bad' }).success).toBe(false);
});
