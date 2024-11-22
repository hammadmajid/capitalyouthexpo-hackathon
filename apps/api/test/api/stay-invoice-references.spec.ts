import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError, type StayInvoiceReferencePage } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { StayInvoiceRepository } from '../../src/stay/invoice.repository.js';
import { StayInvoiceService } from '../../src/stay/invoice.service.js';
import { queryFixture } from '../unit/query-fixture.js';
import { invoiceActor as actor, invoiceIds as ids } from '../unit/stay-invoice.fixture.js';
import { testKeys } from '../keys.js';
const invoiceId = '10000000-0000-4000-8000-000000000001';
const page: StayInvoiceReferencePage = {
  branchId: ids.branch,
  stayId: ids.stay,
  nextCursor: null,
  data: [
    {
      invoiceId,
      invoiceNumber: 'INV-1',
      issuedAt: '2028-02-01T06:00:00.000Z',
      dueDate: '2028-03-01',
      documentState: 'issued',
    },
  ],
};
const repository = new StayInvoiceRepository(queryFixture().database),
  service = new StayInvoiceService(repository);
const staff = vi.spyOn(repository, 'staffList'),
  own = vi.spyOn(repository, 'customerList');
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const headers = { authorization: 'Bearer access' },
  staffUrl = '/v1/branches/' + ids.branch + '/stays/' + ids.stay + '/invoices',
  ownUrl = '/v1/me/stays/' + ids.stay + '/invoices';
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
    { stayInvoices: service },
  );
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  vi.resetAllMocks();
  scopes.branch.mockResolvedValue(true);
  scopes.customer.mockResolvedValue(false);
  staff.mockResolvedValue(page);
  own.mockResolvedValue(page);
});
it.each(['staff', 'own'] as const)(
  'FIN-001 / SEC-003: actual %s HTTP list returns only bounded private references',
  async (kind) => {
    const response = await app.inject({ url: kind === 'staff' ? staffUrl : ownUrl, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(page);
    expect(response.body).not.toContain('Paid');
    expect(response.body).not.toContain('amountPaisa');
    if (kind === 'staff')
      expect(staff).toHaveBeenCalledWith(actor, ids.branch, ids.stay, { limit: 20 });
    else {
      expect(own).toHaveBeenCalledWith(actor, ids.stay, { limit: 20 });
      expect(scopes.customer).not.toHaveBeenCalled();
    }
  },
);
it.each([
  'limit=0',
  'limit=101',
  'cursor=bad',
  'userId=' + actor.userId,
  'paid=true',
  'includePrivate=true',
])('SEC-003: strict collection query %s rejects before financial reads', async (query) => {
  for (const url of [staffUrl, ownUrl])
    expect((await app.inject({ url: url + '?' + query, headers })).statusCode).toBe(400);
  expect(staff).not.toHaveBeenCalled();
  expect(own).not.toHaveBeenCalled();
});
it('SEC-003: branch guard denial cannot reach the collection service', async () => {
  scopes.branch.mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Private denied branch'),
  );
  const response = await app.inject({ url: staffUrl, headers });
  expect(response.statusCode).toBe(403);
  expect(staff).not.toHaveBeenCalled();
});
it('SEC-003: expanded private producer fields and wrong target fail with safe500, never a cached success', async () => {
  for (const corrupt of [
    { ...page, stayId: invoiceId },
    { ...page, privateReason: 'never disclose this value' },
  ]) {
    staff.mockResolvedValue(corrupt);
    own.mockResolvedValue(corrupt);
    for (const url of [staffUrl, ownUrl]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('never disclose this value');
      expect(response.body).not.toContain('Zod');
    }
  }
});
it('SEC-001: unauthenticated list never reads private records', async () => {
  for (const url of [staffUrl, ownUrl]) expect((await app.inject({ url })).statusCode).toBe(401);
  expect(staff).not.toHaveBeenCalled();
  expect(own).not.toHaveBeenCalled();
});
