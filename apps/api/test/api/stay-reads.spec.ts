import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { StayReadRepository } from '../../src/stay/read.repository.js';
import { StayReadService } from '../../src/stay/read.service.js';
import { projectStay, projectStayDetail } from '../../src/stay/read-projection.js';
import { queryFixture } from '../unit/query-fixture.js';
import {
  stayReadActor as actor,
  stayReadIds as ids,
  stayReadRow,
} from '../unit/stay-read.fixture.js';
import { testKeys } from '../keys.js';
const repository = new StayReadRepository(queryFixture().database),
  service = new StayReadService(repository);
const staffPage = vi.spyOn(repository, 'staffPage'),
  customerPage = vi.spyOn(repository, 'customerPage'),
  staffDetail = vi.spyOn(repository, 'staffDetail'),
  customerDetail = vi.spyOn(repository, 'customerDetail');
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const headers = { authorization: 'Bearer access' },
  staff = '/v1/branches/' + ids.branch + '/stays',
  own = '/v1/me/stays';
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
      transport: new AuthTransport(new AuthCrypto(testKeys()), false),
      scopes,
    },
    { stays: service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  scopes.customer.mockResolvedValue(true);
  const row = stayReadRow(),
    page = { data: [projectStay(row)], nextCursor: null };
  staffPage.mockResolvedValue(page);
  customerPage.mockResolvedValue(page);
  staffDetail.mockResolvedValue(projectStayDetail(row));
  customerDetail.mockResolvedValue(projectStayDetail(row));
});
it.each(['staff', 'customer'] as const)(
  'RES-001/002: %s collection preserves exact actor, bounded filters and no-store',
  async (kind) => {
    const response = await app.inject({
      url: (kind === 'staff' ? staff : own) + '?limit=1&state=active',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).not.toHaveProperty('contact');
    if (kind === 'staff')
      expect(staffPage).toHaveBeenCalledWith(actor, ids.branch, { limit: 1, state: 'active' });
    else expect(customerPage).toHaveBeenCalledWith(actor, { limit: 1, state: 'active' });
  },
);
it.each(['staff', 'customer'] as const)(
  'ACC-004: %s detail binds exact path and never accepts a user-supplied account',
  async (kind) => {
    const response = await app.inject({
      url: (kind === 'staff' ? staff : own) + '/' + ids.stay,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    if (kind === 'staff') expect(staffDetail).toHaveBeenCalledWith(actor, ids.branch, ids.stay);
    else expect(customerDetail).toHaveBeenCalledWith(actor, ids.stay);
  },
);
it.each([staff, own, staff + '/' + ids.stay, own + '/' + ids.stay])(
  'SEC-003: %s denies anonymous requests',
  async (url) => {
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect(staffPage).not.toHaveBeenCalled();
    expect(customerPage).not.toHaveBeenCalled();
    expect(staffDetail).not.toHaveBeenCalled();
    expect(customerDetail).not.toHaveBeenCalled();
  },
);
it('ACC-004: branch guard denial never falls back to any private staff or own reader', async () => {
  scopes.branch.mockResolvedValue(false);
  scopes.customer.mockResolvedValue(false);
  // CHG-012: own reads no longer depend on Customer-profile presence; new cases below
  // exercise those routes. A denied staff branch must still never reach either reader.
  for (const url of [staff, staff + '/' + ids.stay])
    expect((await app.inject({ url, headers })).statusCode).toBe(403);
  expect(staffPage).not.toHaveBeenCalled();
  expect(customerPage).not.toHaveBeenCalled();
  expect(staffDetail).not.toHaveBeenCalled();
  expect(customerDetail).not.toHaveBeenCalled();
});
it('ACC-004: live grant denial and another Customer’s Stay remain unavailable', async () => {
  staffPage.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Permission unavailable'));
  expect((await app.inject({ url: staff, headers })).statusCode).toBe(403);
  customerDetail.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Stay unavailable'));
  expect((await app.inject({ url: own + '/' + randomUUID(), headers })).statusCode).toBe(404);
});
it.each([
  staff + '?limit=101',
  staff + '?q=%00',
  staff + '?moveInFrom=2028-03-01&moveInTo=2028-02-01',
  staff + '?cnic=1234512345671',
  own + '?userId=' + ids.resident,
  own + '?q=Other',
  own + '/invalid',
  staff + '/' + ids.stay + '?userId=' + ids.resident,
  own + '/' + ids.stay + '?includeDocuments=true',
])('SEC-003: invalid/private override %s is rejected before repository access', async (url) => {
  expect((await app.inject({ url, headers })).statusCode).toBe(400);
  expect(staffPage).not.toHaveBeenCalled();
  expect(customerPage).not.toHaveBeenCalled();
  expect(staffDetail).not.toHaveBeenCalled();
  expect(customerDetail).not.toHaveBeenCalled();
});
it('SEC-003: service validates direct callers and rejects unexpected private response fields', async () => {
  await expect(service.staffDetail(actor, 'invalid', ids.stay)).rejects.toThrow();
  await expect(
    service.customerDetail(actor, ids.stay, { includeDocuments: true }),
  ).rejects.toThrow();
  const page = { data: [projectStay(stayReadRow())], nextCursor: null, privateFiles: ['secret'] };
  staffPage.mockResolvedValueOnce(page);
  expect((await app.inject({ url: staff, headers })).statusCode).toBe(500);
});

it.each([own, own + '/' + ids.stay])(
  'RES-001 / CHG-009 / SEC-003: linked own-Stay reads at %s do not require an unrelated Customer profile',
  async (url) => {
    scopes.customer.mockResolvedValue(false);
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(scopes.customer).not.toHaveBeenCalled();
    if (url === own) expect(customerPage).toHaveBeenCalledWith(actor, { limit: 20 });
    else expect(customerDetail).toHaveBeenCalledWith(actor, ids.stay);
  },
);
