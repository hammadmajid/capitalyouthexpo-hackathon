import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { InventoryService } from '../../src/inventory/service.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  parentId = randomUUID();
const access = { branchId, permissions: [], canConfigureManagers: false };
const readAccess = vi.fn(),
  page = vi.fn(),
  scopes = {
    owner: vi.fn(),
    branch: vi.fn(),
    customer: vi.fn(),
    object: vi.fn(),
    admin: vi.fn(),
  };
const headers = { authorization: 'Bearer access' };
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
      sessions: { authenticate: async () => actor } as unknown as SessionService,
      transport: new AuthTransport(new AuthCrypto(testKeys()), false),
      scopes,
    },
    { inventory: { page, access: readAccess } as unknown as InventoryService },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  page.mockResolvedValue({ ...access, data: [], nextCursor: null });
  readAccess.mockResolvedValue(access);
});
const root = '/v1/branches/' + branchId + '/inventory/pages';
it.each([
  ['room-types', 'room_types', undefined],
  ['room-types/' + parentId + '/rooms', 'rooms', parentId],
  ['rooms/' + parentId + '/seats', 'seats', parentId],
] as const)(
  'ACC-004 / ROOM-002: %s has bounded canonical paging and no-store',
  async (path, kind, parent) => {
    const response = await application.inject({
      url: root + '/' + path + '?limit=2&cursor=' + parentId.toUpperCase(),
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(page).toHaveBeenCalledWith(
      actor,
      branchId,
      kind,
      { limit: 2, cursor: parentId },
      parent,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ ...access, data: [], nextCursor: null });
  },
);
it('ACC-004: guessed branch is denied before any page service call', async () => {
  scopes.branch.mockResolvedValue(false);
  const response = await application.inject({ url: root + '/room-types', headers });
  expect(response.statusCode).toBe(403);
  expect(page).not.toHaveBeenCalled();
});
it('ACC-004: anonymous inventory pages are rejected', async () => {
  const response = await application.inject({ url: root + '/room-types' });
  expect(response.statusCode).toBe(401);
  expect(page).not.toHaveBeenCalled();
});
it.each(['limit=101', 'limit=0', 'limit=1.5', 'cursor=bad', 'occupants=true', 'state=archived'])(
  'ACC-004: invalid page query %s never reaches the repository',
  async (query) => {
    const response = await application.inject({ url: root + '/room-types?' + query, headers });
    expect(response.statusCode).toBe(400);
    expect(page).not.toHaveBeenCalled();
  },
);

it('ACC-004 / PERF: permission-only route has no page read and rejects any collection query', async () => {
  const response = await application.inject({ url: root + '/access', headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(access);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(readAccess).toHaveBeenCalledWith(actor, branchId, {});
  expect(page).not.toHaveBeenCalled();
  readAccess.mockClear();
  expect((await application.inject({ url: root + '/access?limit=20', headers })).statusCode).toBe(
    400,
  );
  expect(readAccess).not.toHaveBeenCalled();
});
