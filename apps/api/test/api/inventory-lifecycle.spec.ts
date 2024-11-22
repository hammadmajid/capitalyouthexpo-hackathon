import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Actor } from '../../src/authorization/store.js';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { InventoryService } from '../../src/inventory/service.js';
import { testKeys } from '../keys.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  resourceId = randomUUID(),
  key = randomUUID();
const services = {
  read: vi.fn(),
  roomType: vi.fn(),
  room: vi.fn(),
  seat: vi.fn(),
  state: vi.fn(),
  archive: vi.fn(),
};
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const routes = [
  ['state', 'room', 'rooms', 'PUT', { status: 'maintenance', reason: ' Checked ' }],
  ['state', 'seat', 'seats', 'PUT', { status: 'maintenance', reason: ' Checked ' }],
  ['archive', 'room_type', 'room-types', 'POST', { reason: ' Checked ' }],
  ['archive', 'room', 'rooms', 'POST', { reason: ' Checked ' }],
  ['archive', 'seat', 'seats', 'POST', { reason: ' Checked ' }],
] as const;
const crypto = new AuthCrypto(testKeys());
const headers = { authorization: 'Bearer access', 'Idempotency-Key': key };
const url = (plural: string, operation: string) =>
  `/v1/branches/${branchId}/inventory/${plural}/${resourceId}/${operation === 'state' ? 'status' : 'archive'}`;
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
    { inventory: services as unknown as InventoryService },
  );
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.branch.mockResolvedValue(true);
  for (const operation of ['state', 'archive'] as const)
    services[operation].mockImplementation(
      async (
        _actor: Actor,
        _key: string,
        branch: string,
        kind: 'room_type' | 'room' | 'seat',
        id: string,
      ) => ({ status: 200, replayed: false, body: { id, branchId: branch, kind } }),
    );
});
it.each(routes)(
  'PROP-002 / ACC-004: %s %s HTTP validates exact scope, command identity and private response headers',
  async (operation, kind, plural, method, payload) => {
    const response = await app.inject({ method, url: url(plural, operation), headers, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: resourceId, branchId, kind });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(scopes.branch).toHaveBeenCalledWith(actor.userId, branchId, false);
    expect(services[operation]).toHaveBeenCalledWith(actor, key, branchId, kind, resourceId, {
      ...payload,
      reason: 'Checked',
    });
  },
);
it.each(routes)(
  'ACC-004: %s %s cannot bypass a denied branch',
  async (operation, _kind, plural, method, payload) => {
    scopes.branch.mockResolvedValue(false);
    const response = await app.inject({ method, url: url(plural, operation), headers, payload });
    expect(response.statusCode).toBe(403);
    expect(services[operation]).not.toHaveBeenCalled();
  },
);
it('SEC-003: anonymous requests, unsupported states and force flags cannot reach work', async () => {
  const path = url('rooms', 'state');
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: path,
        payload: { status: 'active', reason: 'Activate' },
      })
    ).statusCode,
  ).toBe(401);
  for (const request of [
    { method: 'PUT' as const, url: path, payload: { status: 'paid', reason: 'Unsupported' } },
    {
      method: 'POST' as const,
      url: url('rooms', 'archive'),
      payload: { reason: 'Retired', force: true },
    },
  ]) {
    const response = await app.inject({ ...request, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('code', 'VALIDATION_FAILED');
  }
  expect(services.state).not.toHaveBeenCalled();
  expect(services.archive).not.toHaveBeenCalled();
});
it('ACC-001: typed reservation conflict is not presented as successful archival', async () => {
  services.archive.mockRejectedValueOnce(new DomainError('CONFLICT', 409, 'Live reservations'));
  const response = await app.inject({
    method: 'POST',
    url: url('seats', 'archive'),
    headers,
    payload: { reason: 'Retired' },
  });
  expect(response.statusCode).toBe(409);
  services.archive.mockResolvedValueOnce({
    status: 200,
    body: { id: resourceId, branchId, kind: 'seat' },
    replayed: true,
  });
  const replay = await app.inject({
    method: 'POST',
    url: url('seats', 'archive'),
    headers,
    payload: { reason: 'Retired' },
  });
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
});

it('SEC-003: inventory lifecycle cookie mutations require the credential-bound CSRF token', async () => {
  const csrf = crypto.digest('refresh', 'csrf');
  const cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  const request = {
    method: 'PUT' as const,
    url: url('rooms', 'state'),
    payload: { status: 'active', reason: 'Activate' },
  };
  expect(
    (await app.inject({ ...request, headers: { cookie, 'Idempotency-Key': key } })).statusCode,
  ).toBe(403);
  expect(services.state).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        ...request,
        headers: { cookie, 'Idempotency-Key': key, 'x-csrf-token': csrf },
      })
    ).statusCode,
  ).toBe(200);
  expect(services.state).toHaveBeenCalledOnce();
});
