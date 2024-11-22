import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { MarketplaceService } from '../../src/marketplace/service.js';
import { MarketplaceRepository } from '../../src/marketplace/repository.js';
import type { PublicListingMedia } from '../../src/marketplace/media.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const branchId = randomUUID(),
  parent = randomUUID(),
  store = queryFixture();
const repository = new MarketplaceRepository(store.database, 'private-fixture', 5000);
const types = vi.spyOn(repository.inventoryPages, 'types'),
  rooms = vi.spyOn(repository.inventoryPages, 'rooms'),
  beds = vi.spyOn(repository.inventoryPages, 'beds'),
  overview = vi.spyOn(repository, 'overview');
const authenticate = vi.fn(),
  scopes = { owner: vi.fn(), branch: vi.fn(), customer: vi.fn(), object: vi.fn(), admin: vi.fn() };
const service = new MarketplaceService(repository, {
  read: vi.fn(),
} as unknown as PublicListingMedia);
let application: NestFastifyApplication;
beforeAll(async () => {
  application = await createApplication(
    parseEnvironment({
      ...testKeys(),
      APP_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      CORS_ORIGINS: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
    }),
    {
      postgres: async () => undefined,
      redis: async () => undefined,
      increment: async () => 1,
      close: async () => undefined,
    },
    [],
    {
      sessions: { authenticate } as unknown as SessionService,
      transport: new AuthTransport(new AuthCrypto(testKeys()), false),
      scopes,
    },
    { marketplace: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  types.mockResolvedValue({ branchId, data: [], nextCursor: null });
  rooms.mockResolvedValue({ branchId, roomTypeId: parent, data: [], nextCursor: null });
  beds.mockResolvedValue({ branchId, roomId: parent, data: [], nextCursor: null });
});
const root = '/v1/marketplace/' + branchId + '/inventory/pages';
it.each([
  ['room-types', types],
  ['room-types/' + parent + '/rooms', rooms],
  ['rooms/' + parent + '/beds', beds],
] as const)('ACC-002 / P2-S1: %s is anonymous, scoped and no-store', async (path, read) => {
  const response = await application.inject({ url: root + '/' + path });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toMatchObject({ branchId, data: [], nextCursor: null });
  expect(read).toHaveBeenCalled();
  expect(authenticate).not.toHaveBeenCalled();
  expect(scopes.branch).not.toHaveBeenCalled();
});
it('ACC-002: exact current parents, cursor and complete dates reach repository boundaries', async () => {
  const cursor = randomUUID(),
    url =
      root +
      '/room-types/' +
      parent.toUpperCase() +
      '/rooms?limit=1&cursor=' +
      cursor +
      '&moveInDate=2026-11-01&moveOutDate=2026-11-03';
  expect((await application.inject({ url })).statusCode).toBe(200);
  expect(rooms).toHaveBeenCalledWith(branchId, parent, {
    limit: 1,
    cursor,
    moveInDate: '2026-11-01',
    moveOutDate: '2026-11-03',
  });
});
it.each([
  'limit=101',
  'cursor=bad',
  'moveInDate=2026-11-01',
  'moveInDate=2026-11-03&moveOutDate=2026-11-01',
  'permissions=inventory_edit',
])('ACC-002: invalid boundary %s never reaches a repository read', async (query) => {
  expect((await application.inject({ url: root + '/room-types?' + query })).statusCode).toBe(400);
  expect(types).not.toHaveBeenCalled();
});
it('SEC-003: hidden/withdrawn parent errors expose no foreign identifiers', async () => {
  rooms.mockRejectedValue(new DomainError('NOT_FOUND', 404, 'Room type unavailable'));
  const response = await application.inject({ url: root + '/room-types/' + parent + '/rooms' });
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  expect(response.body).not.toContain(parent);
});
it('ACC-002: invalid path IDs fail before scoped page reads', async () => {
  expect((await application.inject({ url: root + '/rooms/not-an-id/beds' })).statusCode).toBe(400);
  expect(beds).not.toHaveBeenCalled();
});
it('ACC-002: overview has public aggregate metadata without physical arrays or authentication', async () => {
  const value = {
    branchId,
    brandName: 'HSM',
    name: 'Hostel',
    slug: 'hostel',
    category: 'boys' as const,
    city: 'Islamabad',
    area: null,
    latitude: 33.7,
    longitude: 73,
    priceFromPaisa: 1800001,
    verified: true as const,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
    description: null,
    address: 'Public address',
    landmark: null,
    publicPhone: null,
    publicEmail: null,
  };
  overview.mockResolvedValue(value);
  const response = await application.inject({ url: '/v1/marketplace/' + branchId });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(value);
  expect(authenticate).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('no-store');
});
