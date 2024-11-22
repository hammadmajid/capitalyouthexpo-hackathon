import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { InventoryBlockService } from '../../src/inventory/blocks.service.js';
import { InventoryBlockRepository } from '../../src/inventory/blocks.repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const store = queryFixture(),
  repository = new InventoryBlockRepository(store.database);
const read = vi.spyOn(repository, 'read');
const transaction = vi.fn();
const writeStore: IdempotencyStore = {
  transaction: async () => {
    transaction();
    throw new Error('Read must not start an idempotent write');
  },
};
const service = new InventoryBlockService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = `/v1/branches/${branchId}/inventory/blocks`;
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
    { inventoryBlocks: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  read.mockResolvedValue({ data: [], nextCursor: null });
});
it('ACC-004: bounded GET delegates trusted actor and parsed filter without a mutation key', async () => {
  const response = await application.inject({ url: url + '?state=all&limit=1', headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ data: [], nextCursor: null });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(read).toHaveBeenCalledWith(actor, branchId, { limit: 1, state: 'all' });
  expect(scopes.branch).toHaveBeenCalledWith(actor.userId, branchId, false);
  expect(transaction).not.toHaveBeenCalled();
});
it('SEC-003: anonymous history reads fail before repository access', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect(read).not.toHaveBeenCalled();
});
it('ACC-004: denied branch membership fails before repository access', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
it.each(['limit=101', 'state=booked', 'actorUserId=' + actor.userId, 'cursor=invalid'])(
  'SEC-003: strict history query rejects %s',
  async (query) => {
    const response = await application.inject({ url: url + '?' + query, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(read).not.toHaveBeenCalled();
  },
);
it('SEC-003: late session rejection remains an actual denial, never an empty successful list', async () => {
  read.mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  const response = await application.inject({ url, headers });
  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ code: 'SESSION_REVOKED' });
});
