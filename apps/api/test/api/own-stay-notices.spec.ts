import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { ownNoticeServiceFixture } from '../unit/stay-own-notice-service.fixture.js';
import {
  noticeActor as actor,
  noticeIds as ids,
  noticeInput as input,
  noticeResult as result,
} from '../unit/stay-own-notice.fixture.js';
import { testKeys } from '../keys.js';
const f = ownNoticeServiceFixture(),
  crypto = new AuthCrypto(testKeys()),
  headers = { authorization: 'Bearer access' },
  url = '/v1/me/stays/' + ids.stay + '/checkout-request';
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
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
    { ownStayNotices: f.service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  f.responses.clear();
  f.authorize.mockResolvedValue(true);
  f.submit.mockResolvedValue(result);
});
function request(
  key: string = randomUUID(),
  body: unknown = input,
  tokenHeaders: Record<string, string> = headers,
  suffix = '',
) {
  return app.inject({
    method: 'POST',
    url: url + suffix,
    headers: { ...tokenHeaders, 'idempotency-key': key, 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });
}
it('OUT-001 / ACC-004: actual Self endpoint returns only persisted notice timing and replays after current own authority', async () => {
  const key = randomUUID(),
    first = await request(key),
    second = await request(key);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toEqual(result);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.headers['idempotency-replayed']).toBe('false');
  expect(second.headers['idempotency-replayed']).toBe('true');
  expect(f.submit).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  expect(scopes.customer).not.toHaveBeenCalled();
  f.authorize.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Stay unavailable'));
  expect((await request(key)).statusCode).toBe(404);
  expect(f.submit).toHaveBeenCalledTimes(1);
});
it('SEC-003: anonymous requests never reach own-Stay authority or storage', async () => {
  expect((await request(randomUUID(), input, {})).statusCode).toBe(401);
  expect(f.authorize).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});
it.each([
  { userId: actor.userId },
  { branchId: ids.branch },
  { actorRole: 'owner' },
  { releaseInventory: true },
  { feePaisa: 1 },
  { paid: true },
  { state: 'checked_out' },
])(
  'SEC-003 / OUT-006: authority, settlement and occupancy overrides are rejected: %j',
  async (patch) => {
    expect((await request(randomUUID(), { ...input, ...patch })).statusCode).toBe(400);
    expect(f.authorize).not.toHaveBeenCalled();
  },
);
it.each(['?userId=' + actor.userId, '?branchId=' + ids.branch, '?releaseInventory=true'])(
  'SEC-003: query override%s cannot reach notice work',
  async (suffix) => {
    expect((await request(randomUUID(), input, headers, suffix)).statusCode).toBe(400);
    expect(f.authorize).not.toHaveBeenCalled();
  },
);
it('OUT-002: an emergency requires its explicit reason rather than a fabricated default', async () => {
  expect(
    (
      await request(randomUUID(), {
        expectedVersion: 1,
        requestedCheckoutDate: '2028-03-01',
        isEmergency: true,
      })
    ).statusCode,
  ).toBe(400);
  expect(f.authorize).not.toHaveBeenCalled();
});
it('SEC-003: malformed key/path identifiers fail before own scope', async () => {
  expect((await request('bad')).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: url.replace(ids.stay, 'bad'),
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: input,
      })
    ).statusCode,
  ).toBe(400);
  expect(f.authorize).not.toHaveBeenCalled();
});
it('SEC-003: cookie notice requires the actual existing CSRF pair', async () => {
  const refresh = 'notice-refresh',
    csrf = crypto.digest(refresh, 'csrf'),
    cookie = 'hsm_access=access; hsm_refresh=' + refresh + '; hsm_csrf=' + csrf;
  expect(
    (await request(randomUUID(), input, { cookie, origin: 'http://localhost:3000' })).statusCode,
  ).toBe(403);
  expect(
    (
      await request(randomUUID(), input, {
        cookie,
        origin: 'http://localhost:3000',
        'x-csrf-token': csrf,
      })
    ).statusCode,
  ).toBe(201);
});
it('ACC-004: unsuccessful notice does not leak private provider data or become a stored success', async () => {
  f.submit.mockRejectedValueOnce(Error('private provider detail'));
  const response = await request();
  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain('private provider detail');
  expect(f.responses.size).toBe(0);
});

it.each([{ stayId: ids.policy }, { version: 3 }, { actorUserId: 'private-producer-detail' }])(
  'SEC-003 / ACC-004: malformed producer DTO returns a sanitized internal failure without caching: %j',
  async (patch) => {
    f.submit.mockResolvedValueOnce({ ...result, ...patch });
    const response = await request();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: 'INTERNAL', status: 500 });
    expect(response.json()).not.toHaveProperty('errors');
    expect(response.body).not.toContain('private-producer-detail');
    expect(response.body).not.toContain(ids.policy);
    expect(f.responses.size).toBe(0);
  },
);
