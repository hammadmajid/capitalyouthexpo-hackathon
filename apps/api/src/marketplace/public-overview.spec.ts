import { beforeEach, expect, it, vi } from 'vitest';
import { branches } from '@hsm/db';
import { marketplaceQuerySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { readPublicDiscoveryRows } from './discovery-query.js';
import { publicInventory } from './inventory.js';
import { MarketplaceRepository } from './repository.js';
vi.mock('./discovery-query.js', () => ({ readPublicDiscoveryRows: vi.fn() }));
vi.mock('./inventory.js', () => ({ publicInventory: vi.fn() }));
const branchId = '019a1234-1234-7123-8123-123456789abc';
const row = {
  branchId,
  brandName: 'Actual',
  name: 'Actual hostel',
  slug: 'actual',
  category: 'boys' as const,
  city: 'Islamabad',
  area: null,
  latitude: 33.7,
  longitude: 73,
  distanceMeters: null,
  description: null,
  address: 'Actual address',
  landmark: null,
  publicPhone: null,
  publicEmail: null,
};
const summary = {
  branchId,
  brandName: 'Actual',
  name: 'Actual hostel',
  slug: 'actual',
  category: 'boys' as const,
  city: 'Islamabad',
  area: null,
  latitude: 33.7,
  longitude: 73,
  distanceMeters: null,
  priceFromPaisa: '1800001',
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  sortKeys: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readPublicDiscoveryRows).mockResolvedValue([summary]);
});
it('ACC-002 / PERF / P2-S1: initial detail uses real global aggregates and never hydrates physical inventory', async () => {
  const store = queryFixture();
  store.enqueue(branches, [row]);
  const result = await new MarketplaceRepository(store.database, 'private-fixture', 5000).overview(
    branchId,
    marketplaceQuerySchema.parse({}),
  );
  expect(result).toMatchObject({ branchId, name: 'Actual hostel', priceFromPaisa: 1800001 });
  expect(result).not.toHaveProperty('roomTypes');
  expect(publicInventory).not.toHaveBeenCalled();
  expect(readPublicDiscoveryRows).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ ids: [branchId], limit: 1 }),
    expect.any(Date),
    5000,
    'private-fixture',
  );
  expect(store.operations).toContainEqual({ table: branches, kind: 'limit', args: [1] });
});
it('ACC-002: a withdrawn parent never becomes an empty verified detail', async () => {
  const store = queryFixture();
  await expect(
    new MarketplaceRepository(store.database, 'private-fixture', 5000).overview(
      branchId,
      marketplaceQuerySchema.parse({}),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(readPublicDiscoveryRows).not.toHaveBeenCalled();
});
it('ACC-002: an unavailable aggregate parent fails safely without public fallback data', async () => {
  const store = queryFixture();
  store.enqueue(branches, [row]);
  vi.mocked(readPublicDiscoveryRows).mockResolvedValue([]);
  await expect(
    new MarketplaceRepository(store.database, 'private-fixture', 5000).overview(
      branchId,
      marketplaceQuerySchema.parse({}),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(publicInventory).not.toHaveBeenCalled();
});

it('SEC-003 / ACC-002: mismatched parent metadata is rejected before combining another branch summary', async () => {
  const store = queryFixture();
  store.enqueue(branches, [
    { ...row, branchId: '019a1234-1234-7123-8123-123456789abd', name: 'Wrong branch metadata' },
  ]);
  await expect(
    new MarketplaceRepository(store.database, 'private-fixture', 5000).overview(
      branchId,
      marketplaceQuerySchema.parse({}),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(readPublicDiscoveryRows).not.toHaveBeenCalled();
});
