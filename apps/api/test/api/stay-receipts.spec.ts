import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { StayReceiptRepository } from '../../src/stay/receipt.repository.js';
import { StayReceiptService } from '../../src/stay/receipt.service.js';
import { queryFixture } from '../unit/query-fixture.js';
import {
  receiptActor as actor,
  receiptIds as ids,
  receiptDetail,
} from '../unit/stay-receipt.fixture.js';
import { testKeys } from '../keys.js';
const repository = new StayReceiptRepository(queryFixture().database),
  service = new StayReceiptService(repository);
const staff = vi.spyOn(repository, 'staffDetail'),
  customer = vi.spyOn(repository, 'customerDetail');
const scopes = {
  owner: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  object: vi.fn(),
  admin: vi.fn(),
};
const headers = { authorization: 'Bearer access' },
  staffUrl = '/v1/branches/' + ids.branch + '/stays/' + ids.stay + '/receipts/' + ids.receipt,
  ownUrl = '/v1/me/stays/' + ids.stay + '/receipts/' + ids.receipt;
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
    { stayReceipts: service },
  );
});
afterAll(async () => app?.close());
beforeEach(() => {
  vi.clearAllMocks();
  scopes.branch.mockResolvedValue(true);
  scopes.customer.mockResolvedValue(false);
  staff.mockResolvedValue(receiptDetail);
  customer.mockResolvedValue(receiptDetail);
});
it.each([
  { kind: 'staff', url: staffUrl },
  { kind: 'customer', url: ownUrl },
])(
  'FIN-001 / PAY-008: $kind HTTP returns the exact private balance with no-store',
  async ({ kind, url }) => {
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(receiptDetail);
    if (kind === 'staff')
      expect(staff).toHaveBeenCalledWith(actor, ids.branch, ids.stay, ids.receipt);
    else expect(customer).toHaveBeenCalledWith(actor, ids.stay, ids.receipt);
  },
);
it.each([staffUrl, ownUrl])('SEC-003: anonymous invoice %s never reaches a reader', async (url) => {
  expect((await app.inject({ url })).statusCode).toBe(401);
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it('ACC-002: denied branch cannot fall through to either financial reader', async () => {
  scopes.branch.mockResolvedValue(false);
  expect((await app.inject({ url: staffUrl, headers })).statusCode).toBe(403);
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it('ACC-004: live finance permission and exact own object denials retain 403/404', async () => {
  staff.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Management permission required'));
  expect((await app.inject({ url: staffUrl, headers })).statusCode).toBe(403);
  customer.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Invoice unavailable'));
  expect((await app.inject({ url: ownUrl, headers })).statusCode).toBe(404);
});
it.each([
  'today=2028-01-01',
  'allocatedPaisa=1000',
  'state=paid',
  'includeDocuments=true',
  'userId=' + actor.userId,
])('SEC-003: caller financial/private override %s is rejected before reads', async (query) => {
  for (const url of [staffUrl, ownUrl])
    expect((await app.inject({ url: url + '?' + query, headers })).statusCode).toBe(400);
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it.each([
  staffUrl.replace(ids.receipt, 'invalid'),
  staffUrl.replace(ids.stay, 'invalid'),
  ownUrl.replace(ids.receipt, 'invalid'),
])('SEC-003: malformed invoice path %s is rejected', async (url) => {
  expect((await app.inject({ url, headers })).statusCode).toBe(400);
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it.each([{ patch: { receiptId: ids.payment } }, { patch: { cnic: 'private' } }])(
  'PAY-008 / SEC-003: corrupt or sensitive producer response %# is opaque500',
  async ({ patch }) => {
    staff.mockResolvedValue({ ...receiptDetail, ...patch });
    customer.mockResolvedValue({ ...receiptDetail, ...patch });
    for (const url of [staffUrl, ownUrl]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('private');
    }
  },
);
it('RES-001: exact own invoice reads do not require an unrelated Customer profile', async () => {
  expect((await app.inject({ url: ownUrl, headers })).statusCode).toBe(200);
  expect(scopes.customer).not.toHaveBeenCalled();
});
