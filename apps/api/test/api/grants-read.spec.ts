import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { InventoryGrantReadRepository } from '../../src/inventory/grants-read.repository.js';
import { InventoryGrantReadService } from '../../src/inventory/grants-read.service.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  assignmentId = randomUUID();
const repository = new InventoryGrantReadRepository(queryFixture().database),
  read = vi.spyOn(repository, 'read'),
  service = new InventoryGrantReadService(repository);
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = `/v1/branches/${branchId}/managers/${assignmentId}/inventory-permissions`,
  headers = { authorization: 'Bearer access' };
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
    { inventoryGrantRead: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  read.mockResolvedValue({ branchId, assignmentId, permissions: ['inventory_edit'] });
});
it('ACC-004: private saved grants use the exact assignment and no-store response', async () => {
  const result = await application.inject({ url, headers });
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.json()).toEqual({ branchId, assignmentId, permissions: ['inventory_edit'] });
  expect(read).toHaveBeenCalledWith(actor, branchId, assignmentId);
});
it('SEC-003: unauthenticated requests never read permissions', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect(read).not.toHaveBeenCalled();
});
it('ACC-004: branch guard denial prevents private repository access', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
it.each(['?permissions=listing_edit', '?userId=foreign'])(
  'ACC-004: unsupported read query is rejected %s',
  async (suffix) => {
    expect((await application.inject({ url: url + suffix, headers })).statusCode).toBe(400);
    expect(read).not.toHaveBeenCalled();
  },
);
it('ACC-004: unknown exact assignment is opaque and never exposes provider detail', async () => {
  read.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Manager assignment unavailable'));
  expect((await application.inject({ url, headers })).statusCode).toBe(404);
});
it('SEC-003: invalid assignment identifiers never reach the repository', async () => {
  expect(
    (await application.inject({ url: url.replace(assignmentId, 'invalid'), headers })).statusCode,
  ).toBe(400);
  expect(read).not.toHaveBeenCalled();
});
