import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError, billingCatalogEntrySchema, billingCatalogPageSchema } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { BillingCatalogRepository } from '../../src/stay/catalog.repository.js';
import { BillingCatalogService } from '../../src/stay/catalog.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import {
  catalogActor as actor,
  catalogIds as ids,
  catalogNow as now,
  catalogInput as input,
  catalogEntry as entry,
  catalogPage as page,
} from '../unit/billing-catalog.fixture.js';
import { testKeys } from '../keys.js';
const query = queryFixture(),
  repository = new BillingCatalogRepository(query.database);
const authorizeCreate = vi.spyOn(repository, 'authorizeCreate'),
  authorizeArchive = vi.spyOn(repository, 'authorizeArchive'),
  create = vi.spyOn(repository, 'create'),
  archive = vi.spyOn(repository, 'archive'),
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
const service = new BillingCatalogService(repository, new IdempotencyService(store, () => now)),
  crypto = new AuthCrypto(testKeys()),
  headers = { authorization: 'Bearer access' },
  url = '/v1/branches/' + ids.branch + '/charge-catalog',
  archiveUrl = url + '/' + ids.entry + '/archive';
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
    { billingCatalog: service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  responses.clear();
  scopes.branch.mockResolvedValue(true);
  authorizeCreate.mockResolvedValue(true);
  authorizeArchive.mockResolvedValue(true);
  create.mockResolvedValue(entry);
  archive.mockResolvedValue({ ...entry, archivedAt: now.toISOString() });
  read.mockResolvedValue(page);
});
it('FIN-004 / ACC-004: private catalogue GET binds exact branch and bounded query, never Customer eligibility', async () => {
  const response = await app.inject({ url: url + '?limit=1', headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(billingCatalogPageSchema.parse(response.json())).toEqual(page);
  expect(read).toHaveBeenCalledWith(actor, ids.branch, { limit: 1 });
  expect(scopes.customer).not.toHaveBeenCalled();
});
it.each(['read', 'create', 'archive'] as const)(
  'SEC-003: anonymous catalogue %s cannot reach a repository',
  async (kind) => {
    const response = await app.inject({
      method: kind === 'read' ? 'GET' : 'POST',
      url: kind === 'archive' ? archiveUrl : url,
      ...(kind === 'read' ? {} : { payload: kind === 'archive' ? { reason: 'Retired' } : input }),
    });
    expect(response.statusCode).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
  },
);
it('ACC-004: foreign branch guard denial prevents both read and write work', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await app.inject({ url, headers })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: input,
      })
    ).statusCode,
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(authorizeCreate).not.toHaveBeenCalled();
});
it('FIN-004 / AUD-004: catalogue create is201, audited-service composed, private and authorization-bound on replay', async () => {
  const request = {
    method: 'POST' as const,
    url,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: input,
  };
  const first = await app.inject(request),
    second = await app.inject(request);
  expect(first.statusCode).toBe(201);
  expect(billingCatalogEntrySchema.parse(first.json())).toEqual(entry);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.headers['idempotency-replayed']).toBe('false');
  expect(second.statusCode).toBe(201);
  expect(second.headers['idempotency-replayed']).toBe('true');
  expect(create).toHaveBeenCalledTimes(1);
  expect(authorizeCreate).toHaveBeenCalledTimes(2);
  authorizeCreate.mockRejectedValueOnce(new DomainError('BRANCH_FORBIDDEN', 403, 'Owner changed'));
  expect((await app.inject(request)).statusCode).toBe(403);
  expect(create).toHaveBeenCalledTimes(1);
});
it('FIN-004 / AUD-004: archive retains immutable price and rechecks exact-child Owner authority on replay', async () => {
  const request = {
    method: 'POST' as const,
    url: archiveUrl,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { reason: 'Retired' },
  };
  const first = await app.inject(request);
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual({ ...entry, archivedAt: now.toISOString() });
  expect(first.headers['cache-control']).toBe('no-store');
  expect((await app.inject(request)).headers['idempotency-replayed']).toBe('true');
  expect(archive).toHaveBeenCalledTimes(1);
  expect(authorizeArchive).toHaveBeenCalledTimes(2);
  authorizeArchive.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Owner unavailable'));
  expect((await app.inject(request)).statusCode).toBe(403);
});
it.each(['create', 'archive'] as const)(
  'ACC-004: active branch membership cannot bypass Owner-only catalogue %s checks',
  async (kind) => {
    const deny = new DomainError('BRANCH_FORBIDDEN', 403, 'Owner required');
    if (kind === 'create') authorizeCreate.mockRejectedValueOnce(deny);
    else authorizeArchive.mockRejectedValueOnce(deny);
    const response = await app.inject({
      method: 'POST',
      url: kind === 'create' ? url : archiveUrl,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: kind === 'create' ? input : { reason: 'Retired' },
    });
    expect(response.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
  },
);
it('ACC-004: missing finance_view denies private catalogue GET', async () => {
  read.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Permission unavailable'));
  expect((await app.inject({ url, headers })).statusCode).toBe(403);
});
it.each([
  { unitAmountPaisa: 0 },
  { unitAmountPaisa: 1.5 },
  { unitAmountPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { paid: true },
  { createdByUserId: ids.owner },
])(
  'FIN-004 / SEC-003: invalid or injected creation body %# fails before write authorization',
  async (patch) => {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { ...input, ...patch },
    });
    expect(response.statusCode).toBe(400);
    expect(authorizeCreate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  },
);
it.each(['?limit=101', '?includeArchived=yes', '?userId=' + ids.owner])(
  'SEC-003: catalogue query override%s is rejected before repository access',
  async (suffix) => {
    expect((await app.inject({ url: url + suffix, headers })).statusCode).toBe(400);
    expect(read).not.toHaveBeenCalled();
  },
);
it('SEC-003: commands require a valid idempotency key and do not accept query overrides', async () => {
  expect((await app.inject({ method: 'POST', url, headers, payload: input })).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: url + '?paid=true',
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: input,
      })
    ).statusCode,
  ).toBe(400);
  expect(create).not.toHaveBeenCalled();
});
it('ACC-004: foreign catalogue child is opaque404', async () => {
  authorizeArchive.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Unavailable'));
  expect(
    (
      await app.inject({
        method: 'POST',
        url: archiveUrl,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { reason: 'Retired' },
      })
    ).statusCode,
  ).toBe(404);
  expect(archive).not.toHaveBeenCalled();
});
it('SEC-003: cookie catalogue writes require the existing refresh-bound CSRF proof', async () => {
  const refresh = 'catalogue-refresh',
    csrf = crypto.digest(refresh, 'csrf'),
    cookie = 'hsm_access=access; hsm_refresh=' + refresh + '; hsm_csrf=' + csrf;
  const request = {
    method: 'POST' as const,
    url,
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: input,
  };
  expect((await app.inject(request)).statusCode).toBe(403);
  expect(
    (await app.inject({ ...request, headers: { ...request.headers, 'x-csrf-token': csrf } }))
      .statusCode,
  ).toBe(201);
});
it('SEC-003: unexpected private response data cannot be returned as a successful catalogue read', async () => {
  const leaked = { ...page, data: [{ ...entry, privateDocuments: ['secret'] }] };
  read.mockResolvedValueOnce(leaked);
  expect((await app.inject({ url, headers })).statusCode).toBe(500);
});

it.each(['create', 'archive'] as const)(
  'SEC-003: malformed authoritative %s response is500 and never a client validation error',
  async (kind) => {
    if (kind === 'create') create.mockResolvedValueOnce({ ...entry, unitAmountPaisa: 3501 });
    else archive.mockResolvedValueOnce({ ...entry, id: ids.next, archivedAt: now.toISOString() });
    const response = await app.inject({
      method: 'POST',
      url: kind === 'create' ? url : archiveUrl,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: kind === 'create' ? input : { reason: 'Retired' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: 'INTERNAL', status: 500 });
    expect(response.json()).not.toHaveProperty('errors');
    expect(responses.size).toBe(0);
  },
);
