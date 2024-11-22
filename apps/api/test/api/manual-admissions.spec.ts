import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { manualAdmissionServiceFixture } from '../unit/stay-manual-admission-service.fixture.js';
import { paymentActor as actor } from '../unit/stay-payment.fixture.js';
import {
  admissionIds as ids,
  admissionCommand as input,
  admissionResult as result,
} from '../unit/stay-manual-admission.fixture.js';
import { testKeys } from '../keys.js';
const f = manualAdmissionServiceFixture(),
  crypto = new AuthCrypto(testKeys()),
  headers = { authorization: 'Bearer access' },
  url = '/v1/branches/' + ids.branch + '/stays/manual';
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
    { manualAdmissions: f.service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  f.responses.clear();
  scopes.branch.mockResolvedValue(true);
  f.context.mockResolvedValue({ store: f.store, userId: null });
  f.authorize.mockResolvedValue(true);
  f.admit.mockResolvedValue(result);
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
it('STAY-001 / ACC-004: exact private201 admission result replays after live authority without duplicate admission', async () => {
  const key = randomUUID(),
    first = await request(key),
    second = await request(key);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toEqual(result);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.headers['idempotency-replayed']).toBe('false');
  expect(second.headers['idempotency-replayed']).toBe('true');
  expect(f.admit).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  f.authorize.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  expect((await request(key)).statusCode).toBe(403);
  expect(f.admit).toHaveBeenCalledTimes(1);
});
it('ACC-002: anonymous and foreign-branch requests never reach admission context', async () => {
  expect((await request(randomUUID(), input, {})).statusCode).toBe(401);
  scopes.branch.mockResolvedValue(false);
  expect((await request()).statusCode).toBe(403);
  expect(f.context).not.toHaveBeenCalled();
});
it.each([
  { initialBilling: [] },
  { scope: { actorRole: 'owner' } },
  { expectedUserId: ids.customer },
  { state: 'active' },
  { paid: true },
  { manual: { ...input.manual, terms: { ...input.manual.terms, rentAmountPaisa: 0.1 } } },
])(
  'SEC-003 / FIN-001: invalid or injected admission body %# never reaches preflight',
  async (patch) => {
    expect((await request(randomUUID(), { ...input, ...patch })).statusCode).toBe(400);
    expect(f.context).not.toHaveBeenCalled();
  },
);
it.each(['?userId=' + actor.userId, '?paid=true', '?includeProof=true'])(
  'SEC-003: query override%s cannot reach admission service',
  async (suffix) => {
    expect((await request(randomUUID(), input, headers, suffix)).statusCode).toBe(400);
    expect(f.context).not.toHaveBeenCalled();
  },
);
it('STAY-001: missing/invalid idempotency key and malformed resource path fail before admission work', async () => {
  expect((await app.inject({ method: 'POST', url, headers, payload: input })).statusCode).toBe(400);
  expect((await request('invalid')).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: url.replace(ids.branch, 'invalid'),
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: input,
      })
    ).statusCode,
  ).toBe(400);
  expect(f.context).not.toHaveBeenCalled();
});
it('SEC-003: cookie admission requires the existing CSRF pair', async () => {
  const refresh = 'payment-refresh',
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
it('ACC-004: same key with changed admission cannot silently reuse previous Stay', async () => {
  const key = randomUUID();
  expect((await request(key)).statusCode).toBe(201);
  expect(
    (
      await request(key, {
        ...input,
        initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 1 }],
      })
    ).statusCode,
  ).toBe(409);
  expect(f.admit).toHaveBeenCalledTimes(1);
});
it.each([{ branchId: ids.file }, { stayId: 'invalid' }, { userId: ids.customer }])(
  'SEC-003: malformed or private-extended producer result %# is opaque500 without caching',
  async (patch) => {
    f.admit.mockResolvedValue({ ...result, ...patch });
    const response = await request();
    expect(response.statusCode).toBe(500);
    expect(f.responses.size).toBe(0);
    expect(response.body).not.toContain('userId');
  },
);
it('AUD-004 / NTF-002: required persistence failure returns500 and permits same-intent retry', async () => {
  const key = randomUUID();
  f.admit.mockRejectedValueOnce(new Error('Private internal failure'));
  const failed = await request(key);
  expect(failed.statusCode).toBe(500);
  expect(failed.body).not.toContain('Private internal failure');
  expect(f.responses.size).toBe(0);
  expect((await request(key)).statusCode).toBe(201);
});
