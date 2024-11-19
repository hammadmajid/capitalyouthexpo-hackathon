import { expect, it } from 'vitest';
import {
  marketplaceQuerySchema,
  listingSummarySchema,
  listingDetailsSchema,
  listingPageSchema,
  institutionPageSchema,
  institutionInputSchema,
  institutionStateSchema,
  favoriteInputSchema,
  favoriteStateSchema,
} from './marketplace.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const listing = {
  branchId: id,
  brandName: 'Approved hostel',
  name: 'Approved branch',
  slug: 'approved',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.68,
  longitude: 73.04,
  priceFromPaisa: null,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
};
it('ACC-002: no-date browsing has no fabricated occupancy counts or prices', () => {
  expect(marketplaceQuerySchema.parse({})).toEqual({ availableOnly: false, limit: 20 });
  expect(marketplaceQuerySchema.parse({ availableOnly: 'false' }).availableOnly).toBe(false);
  expect(listingSummarySchema.parse(listing)).toEqual(listing);
  expect(listingPageSchema.parse({ data: [], nextCursor: null })).toEqual({
    data: [],
    nextCursor: null,
  });
});
it('ACC-002: complete stay, map, amenity, institution and exact price filters normalize safely', () => {
  const input = {
    q: '  NUST  ',
    availableOnly: 'true',
    moveInDate: '2027-01-01',
    moveOutDate: '2027-02-01',
    minimumRentPaisa: '1800000',
    maximumRentPaisa: '2000000',
    universityPlaceId: id.toUpperCase(),
    radiusMeters: '5000',
    west: '72',
    east: '74',
    south: '32',
    north: '34',
    amenities: 'wifi,parking',
    limit: '10',
  };
  const value = marketplaceQuerySchema.parse(input);
  expect(value).toMatchObject({
    q: 'NUST',
    availableOnly: true,
    universityPlaceId: id,
    amenities: ['wifi', 'parking'],
    limit: 10,
  });
  expect(marketplaceQuerySchema.parse({ amenities: '' }).amenities).toEqual([]);
  expect(
    marketplaceQuerySchema.parse({
      moveInDate: input.moveInDate,
      moveOutDate: input.moveOutDate,
      category: 'girls',
      cityId: id,
      areaId: id,
    }),
  ).toMatchObject({ category: 'girls' });
});
it.each([
  { availableOnly: 'true' },
  { availableOnly: true },
  { moveInDate: '2027-01-01' },
  { moveOutDate: '2027-02-01' },
  { moveInDate: '2027-02-01', moveOutDate: '2027-02-01' },
  { moveInDate: '2027-02-02', moveOutDate: '2027-02-01' },
  { moveInDate: '2027-02-29', moveOutDate: '2027-03-01' },
  { minimumRentPaisa: '2', maximumRentPaisa: '1' },
  { minimumRentPaisa: '0.1' },
  { maximumRentPaisa: '-1' },
  { maximumRentPaisa: '9007199254740992' },
  { universityPlaceId: id },
  { radiusMeters: '5000' },
  { west: '72' },
  { west: '74', east: '72', south: '32', north: '34' },
  { west: '72', east: '74', south: '34', north: '32' },
  { west: '72', east: '72', south: '32', north: '34' },
  { west: '-181', east: '74', south: '32', north: '34' },
  { amenities: 'raw_cnic,*' },
  { q: 'x'.repeat(121) },
  { limit: '101' },
  { customerUserId: id },
])('ACC-002: invalid/privacy-changing marketplace filters are rejected', (query) => {
  expect(() => marketplaceQuerySchema.parse(query)).toThrow();
});
it('ACC-002: public boundaries reject private identity, rent status and storage metadata', () => {
  for (const privateField of [
    'occupantName',
    'cnic',
    'cnicLast4',
    'rentStatus',
    'bucket',
    'objectKey',
    'customerUserId',
    'verificationDocumentId',
  ])
    expect(() => listingSummarySchema.parse({ ...listing, [privateField]: 'private' })).toThrow();
  expect(() => listingSummarySchema.parse({ ...listing, verified: false })).toThrow();
  expect(() =>
    listingSummarySchema.parse({
      ...listing,
      media: [{ id, altText: 'Public photo', fileId: id }],
    }),
  ).toThrow();
  const details = {
    ...listing,
    description: null,
    address: 'Approved address',
    landmark: null,
    publicPhone: null,
    publicEmail: null,
  };
  expect(listingDetailsSchema.parse(details)).toEqual(details);
  expect(() =>
    listingDetailsSchema.parse({ ...details, internalBlockReason: 'private' }),
  ).toThrow();
  expect(
    institutionPageSchema.parse({
      data: [
        {
          id,
          type: 'locality',
          name: 'Approved institution',
          shortName: null,
          cityId: id,
          latitude: 33.68,
          longitude: 73.04,
          hostelCount: 0,
        },
      ],
      nextCursor: null,
    }).data[0]?.hostelCount,
  ).toBe(0);
});

it('ACC-002: recents/Saved and approved directory edits are bounded and cannot inject identities', () => {
  expect(marketplaceQuerySchema.parse({ ids: id.toUpperCase() }).ids).toEqual([id]);
  expect(() =>
    marketplaceQuerySchema.parse({ ids: Array.from({ length: 21 }, () => id).join(',') }),
  ).toThrow();
  expect(favoriteInputSchema.parse({ saved: false }).saved).toBe(false);
  expect(favoriteStateSchema.parse({ branchId: id, saved: true }).saved).toBe(true);
  expect(() => favoriteInputSchema.parse({ saved: true, userId: id })).toThrow();
  const institution = {
    name: 'Approved university',
    shortName: null,
    cityId: id,
    areaId: null,
    address: null,
    latitude: 33.68,
    longitude: 73.04,
    aliases: ['Institution'],
    isActive: true,
    publicApproved: false,
  };
  // CHG-034: older clients omit the category and get a campus.
  expect(institutionInputSchema.parse(institution)).toEqual({ ...institution, type: 'university' });
  expect(institutionInputSchema.parse({ ...institution, type: 'health' }).type).toBe('health');
  expect(() => institutionInputSchema.parse({ ...institution, type: 'casino' })).toThrow();
  expect(
    institutionStateSchema.parse({ id, isActive: false, publicApproved: false }).publicApproved,
  ).toBe(false);
  expect(() =>
    institutionInputSchema.parse({ ...institution, aliases: ['NUST', 'nust'] }),
  ).toThrow();
  expect(() => institutionInputSchema.parse({ ...institution, latitude: 91 })).toThrow();
  expect(() => institutionInputSchema.parse({ ...institution, longitude: -181 })).toThrow();
});
it('CHG-034: a map point anchors nearest search; it needs both coordinates, a radius and no place', () => {
  const point = { nearLatitude: '33.68', nearLongitude: '73.01', radiusMeters: '10000' };
  expect(marketplaceQuerySchema.parse({ ...point, sort: 'nearest' })).toMatchObject({
    nearLatitude: 33.68,
    nearLongitude: 73.01,
    radiusMeters: 10000,
  });
  expect(
    marketplaceQuerySchema.safeParse({ nearLatitude: '33.6', radiusMeters: '10000' }).success,
  ).toBe(false);
  expect(
    marketplaceQuerySchema.safeParse({ nearLatitude: '33.6', nearLongitude: '73' }).success,
  ).toBe(false);
  expect(
    marketplaceQuerySchema.safeParse({
      ...point,
      universityPlaceId: '10000000-0000-4000-8000-000000000001',
    }).success,
  ).toBe(false);
  expect(marketplaceQuerySchema.safeParse({ sort: 'nearest' }).success).toBe(false);
  expect(
    marketplaceQuerySchema.safeParse({
      nearLatitude: '91',
      nearLongitude: '73',
      radiusMeters: '500',
    }).success,
  ).toBe(false);
});
