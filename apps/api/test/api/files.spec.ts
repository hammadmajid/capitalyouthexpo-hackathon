import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { FileService } from '../../src/files/service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  id = randomUUID();
const crypto = new AuthCrypto(testKeys());
const upload = {
  purpose: 'payment_proof',
  fileName: 'proof.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 24,
};
const state = { fileId: id, scanStatus: 'pending', mimeType: 'application/pdf', sizeBytes: 24 };
const services = {
  upload: vi.fn().mockResolvedValue({
    fileId: id,
    uploadUrl: 'https://storage.invalid/upload',
    headers: { 'content-type': 'application/pdf' },
    expiresAt: '2026-10-08T12:05:00.000Z',
  }),
  read: vi.fn().mockResolvedValue(state),
  complete: vi.fn().mockResolvedValue(state),
  download: vi.fn().mockResolvedValue({
    url: 'https://storage.invalid/download',
    expiresAt: '2026-10-08T12:01:00.000Z',
  }),
  close: vi.fn(),
};
const sessions = { authenticate: vi.fn().mockResolvedValue(actor) };
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
      sessions: sessions as unknown as SessionService,
      transport: new AuthTransport(crypto, false),
    },
    { files: services as unknown as FileService },
  );
});
beforeEach(() => vi.clearAllMocks());
afterAll(async () => {
  await application?.close();
});
const bearer = { authorization: 'Bearer test' };
it('SEC-003: uploader routes require authentication and dispatch only the trusted actor', async () => {
  const routes = [
    { method: 'POST' as const, url: '/v1/files/uploads', payload: upload },
    { method: 'POST' as const, url: '/v1/files/' + id + '/complete', payload: {} },
    { method: 'GET' as const, url: '/v1/files/' + id },
    { method: 'GET' as const, url: '/v1/files/' + id + '/download' },
  ];
  for (const route of routes) expect((await application.inject(route)).statusCode).toBe(401);
  const response = await application.inject({
    ...routes[0],
    headers: { ...bearer, 'x-user-id': randomUUID() },
  });
  expect(response.statusCode).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(services.upload).toHaveBeenCalledWith(actor, upload);
  expect((await application.inject({ ...routes[1], headers: bearer })).statusCode).toBe(202);
  expect(services.complete).toHaveBeenCalledWith(actor, id);
  expect((await application.inject({ ...routes[2], headers: bearer })).json()).toEqual(state);
  expect(services.read).toHaveBeenCalledWith(actor, id);
  expect((await application.inject({ ...routes[3], headers: bearer })).statusCode).toBe(200);
  expect(services.download).toHaveBeenCalledWith(actor, id);
});
it('SEC-003: strict request pipes reject metadata injection, executables and malformed identifiers', async () => {
  for (const payload of [
    { ...upload, uploadedBy: actor.userId },
    { ...upload, fileName: 'proof.exe' },
  ]) {
    expect(
      (
        await application.inject({
          method: 'POST',
          url: '/v1/files/uploads',
          headers: bearer,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(services.upload).not.toHaveBeenCalled();
  expect(
    (
      await application.inject({
        method: 'POST',
        url: '/v1/files/' + id + '/complete',
        headers: bearer,
        payload: { scanStatus: 'clean' },
      })
    ).statusCode,
  ).toBe(400);
  expect(services.complete).not.toHaveBeenCalled();
  expect((await application.inject({ url: '/v1/files/invalid', headers: bearer })).statusCode).toBe(
    400,
  );
  expect(services.read).not.toHaveBeenCalled();
});
it('SEC-003: unsafe cookie file requests require the existing refresh-bound CSRF token', async () => {
  const csrf = crypto.digest('refresh', 'csrf');
  const cookie = 'hsm_access=access; hsm_refresh=refresh; hsm_csrf=' + csrf;
  expect(
    (
      await application.inject({
        method: 'POST',
        url: '/v1/files/uploads',
        headers: { cookie },
        payload: upload,
      })
    ).statusCode,
  ).toBe(403);
  expect(services.upload).not.toHaveBeenCalled();
  expect(
    (
      await application.inject({
        method: 'POST',
        url: '/v1/files/uploads',
        headers: { cookie, 'x-csrf-token': csrf },
        payload: upload,
      })
    ).statusCode,
  ).toBe(201);
  expect(services.upload).toHaveBeenCalledWith(actor, upload);
});
it('SEC-003: inaccessible files and provider failures retain safe problem responses', async () => {
  services.read.mockRejectedValueOnce(
    new DomainError('NOT_FOUND', 404, 'Private file information'),
  );
  const response = await application.inject({ url: '/v1/files/' + id, headers: bearer });
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  expect(response.body).not.toContain('Private file information');
  services.download.mockRejectedValueOnce(new Error('Private provider details'));
  const failure = await application.inject({
    url: '/v1/files/' + id + '/download',
    headers: bearer,
  });
  expect(failure.statusCode).toBe(500);
  expect(failure.json().code).toBe('INTERNAL');
  expect(failure.body).not.toContain('Private provider details');
});
it('SEC-003: OpenAPI exposes strict private file DTOs and both authenticated transports', async () => {
  const document = (await application.inject({ url: '/v1/docs-json' })).json();
  const uploadRoute = document.paths['/v1/files/uploads'].post;
  expect(uploadRoute.requestBody.content['application/json'].schema).toMatchObject({
    additionalProperties: false,
    required: ['purpose', 'fileName', 'mimeType', 'sizeBytes'],
  });
  expect(uploadRoute.security).toEqual(expect.arrayContaining([{ bearer: [] }, { cookie: [] }]));
  expect(
    document.paths['/v1/files/{fileId}/download'].get.responses['200'].content['application/json']
      .schema.required,
  ).toEqual(['url', 'expiresAt']);
});
