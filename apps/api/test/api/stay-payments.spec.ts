import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { paymentServiceFixture } from '../unit/stay-payment-service.fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentInput as input,
  paymentResult as result,
} from '../unit/stay-payment.fixture.js';
import { testKeys } from '../keys.js';
const f = paymentServiceFixture(),
  crypto = new AuthCrypto(testKeys()),
  headers = { authorization: 'Bearer access' },
  url = '/v1/branches/' + ids.branch + '/stays/' + ids.stay + '/payments';
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
    { stayPayments: f.service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  f.responses.clear();
  scopes.branch.mockResolvedValue(true);
  f.context.mockResolvedValue({ store: f.store, userId: ids.customer });
  f.authorize.mockResolvedValue(true);
  f.record.mockResolvedValue(result);
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
it('PAY-008 / ACC-004: exact private201 receipt result replays after live authority without duplicate payment', async () => {
  const key = randomUUID(),
    first = await request(key),
    second = await request(key);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toEqual(result);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.headers['idempotency-replayed']).toBe('false');
  expect(second.headers['idempotency-replayed']).toBe('true');
  expect(f.record).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  f.authorize.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  expect((await request(key)).statusCode).toBe(403);
  expect(f.record).toHaveBeenCalledTimes(1);
});
it('ACC-002: anonymous and foreign-branch requests never reach payment context', async () => {
  expect((await request(randomUUID(), input, {})).statusCode).toBe(401);
  scopes.branch.mockResolvedValue(false);
  expect((await request()).statusCode).toBe(403);
  expect(f.context).not.toHaveBeenCalled();
});
it.each([
  { amountPaisa: 0.1 },
  { amountPaisa: 0 },
  { depositPaisa: 999 },
  { paid: true },
  { approvedByUserId: actor.userId },
  { bankVerified: true },
  {
    allocations: [
      { invoiceId: ids.receipt, amountPaisa: 1 },
      { invoiceId: ids.receipt, amountPaisa: 1 },
    ],
  },
])(
  'SEC-003 / FIN-001: invalid or injected payment body %# never reaches preflight',
  async (patch) => {
    expect((await request(randomUUID(), { ...input, ...patch })).statusCode).toBe(400);
    expect(f.context).not.toHaveBeenCalled();
  },
);
it.each(['?userId=' + actor.userId, '?paid=true', '?includeProof=true'])(
  'SEC-003: query override%s cannot reach payment service',
  async (suffix) => {
    expect((await request(randomUUID(), input, headers, suffix)).statusCode).toBe(400);
    expect(f.context).not.toHaveBeenCalled();
  },
);
it('PAY-008: missing/invalid idempotency key and malformed resource path fail before financial work', async () => {
  expect((await app.inject({ method: 'POST', url, headers, payload: input })).statusCode).toBe(400);
  expect((await request('invalid')).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: url.replace(ids.stay, 'invalid'),
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: input,
      })
    ).statusCode,
  ).toBe(400);
  expect(f.context).not.toHaveBeenCalled();
});
it('SEC-003: cookie payment recording requires the existing CSRF pair', async () => {
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
it('ACC-004: same key with changed payment cannot silently reuse previous receipt', async () => {
  const key = randomUUID();
  expect((await request(key)).statusCode).toBe(201);
  expect(
    (await request(key, { ...input, amountPaisa: 1002, advanceCreditPaisa: 2 })).statusCode,
  ).toBe(409);
  expect(f.record).toHaveBeenCalledTimes(1);
});
it.each([{ amountPaisa: 1002 }, { receiptId: 'invalid' }, { proofFileId: ids.file }])(
  'SEC-003: malformed or private-extended producer result %# is opaque500 without caching',
  async (patch) => {
    f.record.mockResolvedValue({ ...result, ...patch });
    const response = await request();
    expect(response.statusCode).toBe(500);
    expect(f.responses.size).toBe(0);
    expect(response.body).not.toContain('proofFileId');
  },
);
it('AUD-004 / NTF-002: required persistence failure returns500 and permits same-intent retry', async () => {
  const key = randomUUID();
  f.record.mockRejectedValueOnce(new Error('Private internal failure'));
  const failed = await request(key);
  expect(failed.statusCode).toBe(500);
  expect(failed.body).not.toContain('Private internal failure');
  expect(f.responses.size).toBe(0);
  expect((await request(key)).statusCode).toBe(201);
});
