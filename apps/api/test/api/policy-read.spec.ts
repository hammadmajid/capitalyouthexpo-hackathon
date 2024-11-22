import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { BookingPolicyService } from '../../src/inventory/policy.service.js';
import { BookingPolicyRepository } from '../../src/inventory/policy.repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const store = queryFixture(),
  repository = new BookingPolicyRepository(store.database);
const read = vi.spyOn(repository, 'read');
const transaction = vi.fn();
const writeStore: IdempotencyStore = {
  transaction: async () => {
    transaction();
    throw new Error('Read must not start an idempotent write');
  },
};
const service = new BookingPolicyService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const brandId = randomUUID(),
  typeId = randomUUID();
const url = `/v1/branches/${branchId}/booking-policy`;
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
    { bookingPolicies: service },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  scopes.owner.mockResolvedValue(true);
  scopes.admin.mockResolvedValue({ isRoot: true, roles: [] });
  read.mockResolvedValue({
    configured: false,
    target: { level: 'branch', scopeId: branchId },
    canEdit: false,
  });
});

it.each([
  ['/v1/admin/booking-policy', { level: 'platform' }],
  [`/v1/owner/brands/${brandId}/booking-policy`, { level: 'hostel', id: brandId }],
  [url, { level: 'branch', id: branchId }],
  [
    `/v1/branches/${branchId}/inventory/room-types/${typeId}/booking-policy`,
    { level: 'room_type', id: typeId, branchId },
  ],
])(
  'BKG-006: GET %s delegates the trusted actor and normalized target without a mutation key',
  async (path, target) => {
    const response = await application.inject({ url: path, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(read).toHaveBeenCalledWith(actor, target);
    expect(transaction).not.toHaveBeenCalled();
  },
);
it('SEC-003: anonymous policy reads fail before repository access', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect(read).not.toHaveBeenCalled();
});
it('ACC-004: denied branch membership prevents policy reads', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
it('ACC-004: ordinary admins cannot read Root policy settings', async () => {
  scopes.admin.mockResolvedValue({ isRoot: false, roles: ['verification'] });
  expect((await application.inject({ url: '/v1/admin/booking-policy', headers })).statusCode).toBe(
    403,
  );
  expect(read).not.toHaveBeenCalled();
});
it('SEC-003: invalid room type identifiers never reach the service', async () => {
  const response = await application.inject({
    url: `/v1/branches/${branchId}/inventory/room-types/invalid/booking-policy`,
    headers,
  });
  expect(response.statusCode).toBe(400);
  expect(read).not.toHaveBeenCalled();
});
it('SEC-003: late session rejection remains a denial', async () => {
  read.mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  expect((await application.inject({ url, headers })).statusCode).toBe(401);
});

it('SEC-003: policy reads reject unrecognized query fields', async () => {
  expect(
    (await application.inject({ url: url + '?actorUserId=' + actor.userId, headers })).statusCode,
  ).toBe(400);
  expect(read).not.toHaveBeenCalled();
});
