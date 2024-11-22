import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, branchAmenities, listingMedia, places, roomTypeAmenities } from '@hsm/db';
import { marketplaceQuerySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { readPublicDiscoveryRows } from './discovery-query.js';
import { publicInventory } from './inventory.js';
import { MarketplaceRepository } from './repository.js';
vi.mock('./discovery-query.js', () => ({ readPublicDiscoveryRows: vi.fn() }));
vi.mock('./inventory.js', () => ({ publicInventory: vi.fn() }));
const id = '019a1234-1234-7123-8123-123456789abc',
  otherId = '019a1234-1234-7123-8123-123456789abd',
  now = new Date('2026-10-14T12:00:00Z');
const row = {
  branchId: id,
  brandName: 'Approved brand',
  name: 'Approved branch',
  slug: 'approved',
  category: 'boys' as const,
  city: 'Islamabad',
  area: null,
  latitude: 33.68,
  longitude: 73.04,
  distanceMeters: null,
  description: null,
  address: 'Public address',
  landmark: null,
  publicPhone: null,
  publicEmail: null,
  privateOccupantName: 'Never disclose occupant identity',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(publicInventory).mockResolvedValue({
    roomTypes: [],
    priceFromPaisa: 1800001,
    availableBeds: null,
    availableWholeRooms: null,
  });
});
function fixture(rows: (typeof row)[] = [row]) {
  vi.mocked(readPublicDiscoveryRows).mockResolvedValue(
    rows.map((value) => ({
      branchId: value.branchId,
      brandName: value.brandName,
      name: value.name,
      slug: value.slug,
      category: value.category,
      city: value.city,
      area: value.area,
      latitude: value.latitude,
      longitude: value.longitude,
      distanceMeters: value.distanceMeters,
      priceFromPaisa: '1800001',
      availableBeds: null,
      availableWholeRooms: null,
      amenities: [],
      media: [],
      sortKeys: null,
    })),
  );
  const store = queryFixture();
  store.enqueue(branches, rows);
  store.enqueue(branchAmenities, []);
  store.enqueue(listingMedia, []);
  return {
    ...store,
    repository: new MarketplaceRepository(store.database, 'private-catalog', 5000, () => now),
  };
}
it('ACC-002: public list returns approved projection without identity, private contact or inventory internals', async () => {
  const store = fixture();
  const result = await store.repository.list(marketplaceQuerySchema.parse({}));
  expect(result.data[0]).toMatchObject({ branchId: id, verified: true, priceFromPaisa: 1800001 });
  expect(JSON.stringify(result)).not.toContain('Never disclose occupant identity');
  expect(result.data[0]).not.toHaveProperty('publicPhone');
  expect(result.data[0]).not.toHaveProperty('roomTypes');
  expect(publicInventory).not.toHaveBeenCalled();
  expect(readPublicDiscoveryRows).toHaveBeenCalledWith(
    store.transaction,
    expect.any(Object),
    now,
    5000,
    'private-catalog',
  );
});
it('ACC-002: pagination advertises only a real continuation without inventing listings', async () => {
  const store = fixture([row, { ...row, branchId: otherId }]);
  const result = await store.repository.list(marketplaceQuerySchema.parse({ limit: 1 }));
  expect(result.data).toHaveLength(1);
  expect(result.nextCursor).toBe(id);
});
it('ACC-002: empty approved listings remain empty', async () => {
  const store = fixture([]);
  expect(await store.repository.list(marketplaceQuerySchema.parse({}))).toEqual({
    data: [],
    nextCursor: null,
  });
  expect(publicInventory).not.toHaveBeenCalled();
});
it('ACC-002: Saved projection can reuse its caller transaction without a second pool checkout', async () => {
  const store = fixture();
  expect(
    (await store.repository.list(marketplaceQuerySchema.parse({}), store.transaction)).data,
  ).toHaveLength(1);
});
it('ACC-002: approved detail projection exposes only explicit public contact fields', async () => {
  const store = fixture();
  expect(await store.repository.details(id, marketplaceQuerySchema.parse({}))).toMatchObject({
    branchId: id,
    publicPhone: null,
    publicEmail: null,
    verified: true,
    roomTypes: [],
  });
});
it('ACC-002: absent or withdrawn detail cannot disclose supplemental data', async () => {
  const store = fixture([]);
  await expect(
    store.repository.details(id, marketplaceQuerySchema.parse({})),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(publicInventory).not.toHaveBeenCalled();
});
it('ACC-002: institution counts attach to actual approved directory identities', async () => {
  const store = queryFixture(),
    cityId = randomUUID();
  const repository = new MarketplaceRepository(store.database, 'private-catalog', 5000, () => now);
  store.enqueue(places, [
    {
      id,
      type: 'university',
      name: 'University',
      shortName: null,
      cityId,
      latitude: 33.68,
      longitude: 73.04,
    },
    {
      id: otherId,
      type: 'university',
      name: 'Other university',
      shortName: null,
      cityId,
      latitude: 33.7,
      longitude: 73.1,
    },
  ]);
  store.enqueue(branches, [{ placeId: id, hostelCount: 2 }]);
  const result = await repository.institutions({ limit: 1, cursor: randomUUID() }, 'UNI', 5000);
  expect(result.data[0]).toMatchObject({ id, type: 'university', hostelCount: 2 });
  // CHG-033: typed search returns the best matches only; browsing keeps its cursor.
  expect(result.nextCursor).toBeNull();
});
it('ACC-002: no matching hostels produces zero, not a sample university count', async () => {
  const store = queryFixture(),
    cityId = randomUUID();
  const repository = new MarketplaceRepository(store.database, 'private-catalog', 5000, () => now);
  store.enqueue(places, [
    {
      id,
      type: 'university',
      name: 'University',
      shortName: 'UNI',
      cityId,
      latitude: 33.68,
      longitude: 73.04,
    },
  ]);
  expect((await repository.institutions({ limit: 20 })).data[0]?.hostelCount).toBe(0);
});

it('ACC-002 / PERF: marketplace summaries and details fetch one cover preview rather than an unbounded gallery', async () => {
  const store = fixture();
  await store.repository.details(id, marketplaceQuerySchema.parse({}));
  expect(store.operations).toContainEqual({ table: listingMedia, kind: 'limit', args: [1] });
});

it('ROOM-002 / ACC-002: detail room options receive one actual approved amenity batch without private association fields', async () => {
  const roomTypeId = randomUUID(),
    store = fixture();
  vi.mocked(publicInventory).mockResolvedValue({
    roomTypes: [
      {
        id: roomTypeId,
        name: 'Two beds',
        capacity: 2,
        inventoryMode: 'per_bed',
        bedMonthlyRentPaisa: 1800000,
        roomMonthlyRentPaisa: null,
        depositPaisa: 0,
        rooms: [],
      },
    ],
    priceFromPaisa: 1800000,
    availableBeds: null,
    availableWholeRooms: null,
  });
  store.enqueue(roomTypeAmenities, [
    { roomTypeId, code: 'wifi', name: 'Wi-Fi', occupantName: 'Private fixture identity' },
  ]);
  const details = await store.repository.details(id, marketplaceQuerySchema.parse({}));
  expect(details.roomTypes[0]?.amenities).toEqual([{ code: 'wifi', name: 'Wi-Fi' }]);
  expect(JSON.stringify(details)).not.toContain('Private fixture identity');
  expect(
    store.operations.filter(
      (operation) => operation.table === roomTypeAmenities && operation.kind === 'limit',
    ),
  ).toHaveLength(1);
});
