import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { ListingRulesService } from '../../src/inventory/listing-rules.service.js';
import { ListingRulesRepository } from '../../src/inventory/listing-rules.repository.js';
import { projectListingRule } from '../../src/inventory/listing-rules-state.js';
import { PublicListingRulesRepository } from '../../src/marketplace/listing-rules.repository.js';
import { PublicListingRulesService } from '../../src/marketplace/listing-rules.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from '../unit/query-fixture.js';
import { ruleIds as ids, ruleRow } from '../unit/listing-rules.fixture.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  store = queryFixture(),
  rows = new Map<string, StoredResponse>();
const result = { ...projectListingRule(ruleRow()), canEdit: true };
const repository = new ListingRulesRepository(store.database),
  publicRepository = new PublicListingRulesRepository(store.database);
const one = vi.spyOn(repository, 'one'),
  read = vi.spyOn(repository, 'read'),
  create = vi.spyOn(repository, 'create'),
  edit = vi.spyOn(repository, 'edit'),
  archive = vi.spyOn(repository, 'archive'),
  authorize = vi.spyOn(repository, 'authorize'),
  authorizeRule = vi.spyOn(repository, 'authorizeRule'),
  publicRead = vi.spyOn(publicRepository, 'read');
const writeStore: IdempotencyStore = {
  transaction: async (_actor, _now, work) =>
    work({
      database: store.transaction,
      read: async (key) => rows.get(key),
      remove: async (key) => {
        rows.delete(key);
      },
      save: async (key, value) => {
        rows.set(key, value);
      },
    }),
};
const service = new ListingRulesService(repository, new IdempotencyService(writeStore));
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const url = '/v1/branches/' + ids.branch + '/rules',
  publicUrl = '/v1/marketplace/' + ids.branch + '/rules',
  headers = { authorization: 'Bearer access' },
  body = { body: result.body, sortOrder: 0 };
const writeHeaders = () => ({
  ...headers,
  'Idempotency-Key': randomUUID(),
  'If-Match': '"' + result.version + '"',
});
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
    { listingRules: service, publicListingRules: new PublicListingRulesService(publicRepository) },
  );
});
afterAll(async () => {
  await application?.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  scopes.branch.mockResolvedValue(true);
  scopes.owner.mockResolvedValue(true);
  scopes.admin.mockResolvedValue(undefined);
  const scope = {
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner' as const,
  };
  authorize.mockResolvedValue(scope);
  authorizeRule.mockResolvedValue({ scope, row: ruleRow() });
  one.mockResolvedValue(result);
  read.mockResolvedValue({
    branchId: ids.branch,
    state: 'active',
    canEdit: true,
    data: [projectListingRule(ruleRow())],
    nextCursor: null,
  });
  create.mockResolvedValue(result);
  edit.mockResolvedValue(result);
  archive.mockResolvedValue({ ...result, archivedAt: result.updatedAt });
  publicRead.mockResolvedValue({
    branchId: ids.branch,
    data: [{ id: ids.first, body: result.body, sortOrder: 0 }],
    nextCursor: null,
  });
});
it('ACC-002: anonymous public rules use actual validated paging without private authorization or metadata', async () => {
  const response = await application.inject({ url: publicUrl + '?limit=1' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    branchId: ids.branch,
    data: [{ id: ids.first, body: result.body, sortOrder: 0 }],
    nextCursor: null,
  });
  expect(publicRead).toHaveBeenCalledWith(ids.branch, { limit: 1 });
  expect(scopes.branch).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('no-store');
});
it('ACC-002: public archive query fails and withdrawn parent remains typed unavailable', async () => {
  expect((await application.inject({ url: publicUrl + '?state=archived' })).statusCode).toBe(400);
  expect(publicRead).not.toHaveBeenCalled();
  publicRead.mockRejectedValue(new DomainError('NOT_FOUND', 404, 'Listing unavailable'));
  expect((await application.inject({ url: publicUrl })).statusCode).toBe(404);
});
it('ACC-004: scoped exact private reads retain current read-only capability and emit ETag', async () => {
  one.mockResolvedValue({ ...result, canEdit: false });
  const response = await application.inject({ url: url + '/' + ids.first, headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ canEdit: false });
  expect(response.headers.etag).toBe('"' + result.version + '"');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(one).toHaveBeenCalledWith(actor, ids.branch, ids.first);
  expect((await application.inject({ url, headers })).statusCode).toBe(200);
  expect(read).toHaveBeenCalledWith(actor, ids.branch, { limit: 20, state: 'active' });
});
it('SEC-003 / ACC-004: anonymous and guessed branch access fail before private repository IO', async () => {
  expect((await application.inject({ url })).statusCode).toBe(401);
  expect((await application.inject({ method: 'POST', url, payload: body })).statusCode).toBe(401);
  scopes.branch.mockResolvedValue(false);
  expect((await application.inject({ url, headers })).statusCode).toBe(403);
  expect(
    (await application.inject({ method: 'POST', url, headers: writeHeaders(), payload: body }))
      .statusCode,
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
it('TRUST-006 / AUD-001: create and versioned edit/archive remain explicit replayable protected commands', async () => {
  const request = { method: 'POST' as const, url, headers: writeHeaders(), payload: body };
  const first = await application.inject(request);
  expect(first.statusCode).toBe(201);
  expect(first.headers.etag).toBe('"' + result.version + '"');
  expect((await application.inject(request)).headers['idempotency-replayed']).toBe('true');
  expect(create).toHaveBeenCalledTimes(1);
  expect(
    (
      await application.inject({
        method: 'PUT',
        url: url + '/' + ids.first,
        headers: writeHeaders(),
        payload: body,
      })
    ).statusCode,
  ).toBe(200);
  expect(edit).toHaveBeenCalledWith(
    store.transaction,
    actor,
    ids.branch,
    ids.first,
    result.version,
    body,
  );
  expect(
    (
      await application.inject({
        method: 'POST',
        url: url + '/' + ids.first + '/archive',
        headers: writeHeaders(),
        payload: { reason: 'Superseded' },
      })
    ).statusCode,
  ).toBe(200);
  expect(archive).toHaveBeenCalledWith(
    store.transaction,
    actor,
    ids.branch,
    ids.first,
    result.version,
    'Superseded',
  );
});
it('ACC-004: grant revocation denies stored success before a second mutation', async () => {
  const request = {
    method: 'PUT' as const,
    url: url + '/' + ids.first,
    headers: writeHeaders(),
    payload: body,
  };
  expect((await application.inject(request)).statusCode).toBe(200);
  authorizeRule.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  expect((await application.inject(request)).statusCode).toBe(403);
  expect(edit).toHaveBeenCalledTimes(1);
});
it('TRUST-006: stale precondition remains typed 412 rather than silently overwriting', async () => {
  edit.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  const response = await application.inject({
    method: 'PUT',
    url: url + '/' + ids.first,
    headers: writeHeaders(),
    payload: body,
  });
  expect(response.statusCode).toBe(412);
  expect(response.json()).toMatchObject({ code: 'PRECONDITION_FAILED' });
});
it('SEC-001: cookie writes without CSRF proof fail before rule authority checks', async () => {
  const response = await application.inject({
    method: 'POST',
    url,
    headers: {
      cookie: 'hsm_access=access',
      origin: 'http://localhost:3000',
      'Idempotency-Key': randomUUID(),
    },
    payload: body,
  });
  expect(response.statusCode).toBe(403);
  expect(authorize).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
it('SEC-003: extra scope/policy fields, invalid preconditions and missing keys fail before repository IO', async () => {
  expect(
    (await application.inject({ url: url + '?customerId=' + actor.userId, headers })).statusCode,
  ).toBe(400);
  expect(
    (await application.inject({ url: url + '/' + ids.first + '?private=true', headers }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'POST',
        url,
        headers: writeHeaders(),
        payload: { ...body, requiredDocuments: [] },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await application.inject({ method: 'POST', url, headers, payload: body })).statusCode,
  ).toBe(400);
  expect(
    (
      await application.inject({
        method: 'PUT',
        url: url + '/' + ids.first,
        headers: { ...writeHeaders(), 'If-Match': '*' },
        payload: body,
      })
    ).statusCode,
  ).toBe(400);
  expect(authorize).not.toHaveBeenCalled();
  expect(authorizeRule).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
