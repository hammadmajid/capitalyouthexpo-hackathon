import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { billingPolicyVersionSchema, DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { BillingPolicyRepository } from '../../src/stay/billing-policy.repository.js';
import { BillingPolicyService } from '../../src/stay/billing-policy.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import {
  billingActor as actor,
  billingIds as ids,
  billingNow as now,
  billingPolicyFixture as policy,
} from '../unit/billing-policy.fixture.js';
import { testKeys } from '../keys.js';
const query = queryFixture(),
  repository = new BillingPolicyRepository(query.database);
const authorize = vi.spyOn(repository, 'authorize'),
  save = vi.spyOn(repository, 'save'),
  read = vi.spyOn(repository, 'read');
const responses = new Map<string, StoredResponse>();
const store: IdempotencyStore = {
  transaction: async (_actor, _now, work) =>
    work({
      database: query.transaction,
      read: async (key) => responses.get(key),
      remove: async (key) => {
        responses.delete(key);
      },
      save: async (key, value) => {
        responses.set(key, value);
      },
    }),
};
const service = new BillingPolicyService(repository, new IdempotencyService(store, () => now));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const crypto = new AuthCrypto(testKeys()),
  headers = { authorization: 'Bearer access' };
const url = `/v1/branches/${ids.branch}/billing-policy`;
const typeUrl = `/v1/branches/${ids.branch}/inventory/room-types/${ids.type}/billing-policy`;
const result = {
  id: randomUUID(),
  level: 'branch' as const,
  scopeId: ids.branch,
  policy,
  createdAt: now.toISOString(),
};
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApplication(
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
      transport: new AuthTransport(crypto, false),
      scopes,
    },
    { billingPolicies: service },
  );
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  responses.clear();
  scopes.branch.mockResolvedValue(true);
  authorize.mockResolvedValue(true);
  save.mockImplementation(async (_transaction, _actor, target, parsed) => ({
    ...result,
    level: target.roomTypeId ? 'room_type' : 'branch',
    scopeId: target.roomTypeId ?? target.branchId,
    policy: parsed,
  }));
  read.mockResolvedValue({
    target: { branchId: ids.branch },
    canEdit: true,
    localVersion: result,
    effectiveVersion: result,
  });
});
it.each([
  [url, { branchId: ids.branch }],
  [typeUrl, { branchId: ids.branch, roomTypeId: ids.type }],
])(
  'RENT-003 / ACC-004: GET %s binds actor and exact branch child without public caching',
  async (path, target) => {
    const response = await app.inject({ url: path as string, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(read).toHaveBeenCalledWith(actor, target);
    expect(save).not.toHaveBeenCalled();
  },
);
it.each([url, typeUrl])(
  'RENT-003: PUT %s validates policy and requires transaction-bound replay',
  async (path) => {
    const request = {
      url: path,
      method: 'PUT' as const,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { policy },
    };
    const first = await app.inject(request),
      second = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.headers['cache-control']).toBe('no-store');
    expect(save).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(2);
  },
);
it('ACC-004: anonymous and denied branch reads do not reach scoped policy data', async () => {
  expect((await app.inject({ url })).statusCode).toBe(401);
  scopes.branch.mockResolvedValue(false);
  expect((await app.inject({ url, headers })).statusCode).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
it('ACC-004: changed ownership rejects cached successful policy mutation', async () => {
  const request = {
    url,
    method: 'PUT' as const,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { policy },
  };
  expect((await app.inject(request)).statusCode).toBe(200);
  authorize.mockRejectedValueOnce(new DomainError('BRANCH_FORBIDDEN', 403, 'Owner scope required'));
  expect((await app.inject(request)).statusCode).toBe(403);
  expect(save).toHaveBeenCalledTimes(1);
});
it.each([
  { policy: { ...policy, graceDays: -1 } },
  { policy: { ...policy, cycle: { kind: 'calendar_month', dueDay: 32 } } },
  { policy, isCurrent: true },
])('RENT-001 / SEC-003: invalid policy %j fails before authorization or write', async (payload) => {
  expect(
    (
      await app.inject({
        url,
        method: 'PUT',
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload,
      })
    ).statusCode,
  ).toBe(400);
  expect(authorize).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('SEC-003: missing mutation key and invalid scoped identifiers are refused', async () => {
  expect((await app.inject({ url, method: 'PUT', headers, payload: { policy } })).statusCode).toBe(
    400,
  );
  expect(
    (await app.inject({ url: '/v1/branches/invalid/billing-policy', headers })).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        url: `/v1/branches/${ids.branch}/inventory/room-types/invalid/billing-policy`,
        headers,
      })
    ).statusCode,
  ).toBe(400);
  expect(save).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it.each(['GET', 'PUT'] as const)('SEC-003: %s rejects injected query fields', async (method) => {
  expect(
    (
      await app.inject({
        url: url + '?ownerId=' + actor.userId,
        method,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        ...(method === 'PUT' ? { payload: { policy } } : {}),
      })
    ).statusCode,
  ).toBe(400);
  expect(save).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it('SEC-003: cookie mutations require valid refresh-bound CSRF while bearer requests remain supported', async () => {
  const refresh = 'fixture-refresh',
    csrf = crypto.digest(refresh, 'csrf');
  const cookie = `hsm_access=access; hsm_refresh=${refresh}; hsm_csrf=${csrf}`;
  const request = {
    url,
    method: 'PUT' as const,
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: { policy },
  };
  expect((await app.inject(request)).statusCode).toBe(403);
  expect(save).not.toHaveBeenCalled();
  const response = await app.inject({
    ...request,
    headers: { ...request.headers, 'x-csrf-token': csrf },
  });
  expect(response.statusCode).toBe(200);
  expect(save).toHaveBeenCalledTimes(1);
});
it('RENT-003: a reused key with changed financial terms returns a conflict, not a stale policy response', async () => {
  const request = {
    url,
    method: 'PUT' as const,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { policy },
  };
  expect((await app.inject(request)).statusCode).toBe(200);
  expect(
    (await app.inject({ ...request, payload: { policy: { ...policy, noticeDays: 99 } } }))
      .statusCode,
  ).toBe(409);
  expect(save).toHaveBeenCalledTimes(1);
});

it.each([url, typeUrl])(
  'FIN-004 / ACC-004: %s retains independently configured fee timing through HTTP and guarded replay',
  async (path) => {
    const configured = {
      ...policy,
      cycle: { kind: 'week', dueOffsetDays: 2 },
      feeBilling: {
        oneTimeDueOffsetDays: 1,
        monthly: {
          cycle: { kind: 'calendar_month', dueDay: 7 },
          proration: { kind: 'calendar_days', rounding: 'half_up' },
        },
      },
    };
    save.mockImplementation(async (_transaction, _actor, target, parsed) => ({
      ...result,
      level: target.roomTypeId ? 'room_type' : 'branch',
      scopeId: target.roomTypeId ?? target.branchId,
      policy: parsed,
    }));
    const request = {
      url: path,
      method: 'PUT' as const,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { policy: configured },
    };
    const first = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(billingPolicyVersionSchema.parse(first.json()).policy).toEqual(configured);
    expect(save.mock.calls[0]?.[3]).toEqual(configured);
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(billingPolicyVersionSchema.parse(replay.json()).policy).toEqual(configured);
    authorize.mockRejectedValueOnce(new DomainError('BRANCH_FORBIDDEN', 403, 'Owner changed'));
    expect((await app.inject(request)).statusCode).toBe(403);
    expect(save).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { oneTimeDueOffsetDays: -1 },
  {
    oneTimeDueOffsetDays: 0,
    monthly: { cycle: { kind: 'week', dueOffsetDays: 1 }, proration: { kind: 'full_period' } },
  },
  {
    oneTimeDueOffsetDays: 0,
    monthly: {
      cycle: { kind: 'calendar_month', dueDay: 7 },
      proration: { kind: 'fixed_first_period', amountPaisa: 1 },
    },
  },
  { oneTimeDueOffsetDays: 0, amountPaisa: 1 },
])(
  'FIN-004 / SEC-003: invalid fee configuration %j fails at the HTTP boundary',
  async (feeBilling) => {
    const response = await app.inject({
      url,
      method: 'PUT',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { policy: { ...policy, feeBilling } },
    });
    expect(response.statusCode).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  },
);

for (const source of ['fresh', 'replay'] as const) {
  it.each([url, typeUrl])(
    'RENT-003 / SEC-003: ' + source + ' policy response mismatch is opaque500 at %s',
    async (path) => {
      const type = path === typeUrl;
      const correct = billingPolicyVersionSchema.parse({
        ...result,
        level: type ? 'room_type' : 'branch',
        scopeId: type ? ids.type : ids.branch,
      });
      const wrong = { ...correct, policy: { ...policy, graceDays: policy.graceDays + 1 } };
      save.mockResolvedValue(correct);
      const key = randomUUID();
      const request = {
        url: path,
        method: 'PUT' as const,
        headers: { ...headers, 'idempotency-key': key },
        payload: { policy },
      };
      if (source === 'fresh') save.mockResolvedValueOnce(wrong);
      else {
        expect((await app.inject(request)).statusCode).toBe(200);
        const stored = responses.get(key);
        if (!stored) throw Error('Expected persisted command response');
        stored.responseBody = wrong;
      }
      const response = await app.inject(request);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ code: 'INTERNAL', status: 500 });
      expect(response.json()).not.toHaveProperty('errors');
      expect(save).toHaveBeenCalledTimes(1);
      expect(authorize).toHaveBeenCalledTimes(source === 'fresh' ? 1 : 2);
      if (source === 'fresh') expect(responses.size).toBe(0);
    },
  );
}
