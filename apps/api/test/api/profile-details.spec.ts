import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import { ProfileDetailsService } from '../../src/auth/profile-details.service.js';
import type { SessionService } from '../../src/auth/session.service.js';
import { testKeys } from '../keys.js';
import { profileDetailsFixture } from '../profile-details-fixture.js';
vi.setConfig({ testTimeout: 30000 });
const apps: NestFastifyApplication[] = [];
async function setup() {
  const actor = { userId: randomUUID(), sessionId: randomUUID() },
    value = profileDetailsFixture();
  value.userId = actor.userId;
  const read = vi.fn(async () => value);
  const sessions = { authenticate: vi.fn().mockResolvedValue(actor) };
  const app = await createApplication(
    parseEnvironment({
      ...testKeys(),
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      CORS_ORIGINS: 'http://localhost:3000',
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
      transport: new AuthTransport(new AuthCrypto(testKeys()), false),
      profileDetails: new ProfileDetailsService({ read }),
    },
  );
  apps.push(app);
  return { server: app.getHttpAdapter().getInstance(), actor, value, read, sessions };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('SEC AUTH-C: profile edit details require authentication and a live self actor', async () => {
  const f = await setup();
  expect((await f.server.inject({ url: '/v1/me/profile-details' })).statusCode).toBe(401);
  expect(f.read).not.toHaveBeenCalled();
  const response = await f.server.inject({
    url: '/v1/me/profile-details',
    headers: { authorization: 'Bearer access' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual(f.value);
  expect(f.read).toHaveBeenCalledExactlyOnceWith(f.actor);
});
it('SEC: revoked session cannot read edit details', async () => {
  const f = await setup();
  f.sessions.authenticate.mockRejectedValue(
    new DomainError('SESSION_REVOKED', 401, 'Session unavailable'),
  );
  expect(
    (
      await f.server.inject({
        url: '/v1/me/profile-details',
        headers: { authorization: 'Bearer access' },
      })
    ).statusCode,
  ).toBe(401);
  expect(f.read).not.toHaveBeenCalled();
});
it('SEC: there is no user-selected edit-details route', async () => {
  const f = await setup();
  expect(
    (
      await f.server.inject({
        url: '/v1/me/profile-details/' + randomUUID(),
        headers: { authorization: 'Bearer access' },
      })
    ).statusCode,
  ).toBe(404);
  expect(f.read).not.toHaveBeenCalled();
});
it('AUTH-C: safe cookie-authenticated read does not require a mutation CSRF token', async () => {
  const f = await setup();
  const response = await f.server.inject({
    url: '/v1/me/profile-details',
    headers: { cookie: 'hsm_access=access' },
  });
  expect(response.statusCode).toBe(200);
  expect(f.read).toHaveBeenCalledWith(f.actor);
});
it('SEC-003: OpenAPI edit projection excludes secrets, CNIC plaintext and storage capabilities', async () => {
  const f = await setup();
  const response = await f.server.inject({ url: '/v1/docs-json' });
  expect(response.statusCode).toBe(200);
  const schema =
    response.json().paths['/v1/me/profile-details'].get.responses['200'].content['application/json']
      .schema;
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.customer.anyOf[0].properties.age.anyOf[0]).toMatchObject({
    minimum: 18,
    maximum: 120,
  });
  for (const field of [
    'passwordHash',
    'cnic',
    'cnicHash',
    'cnicEncrypted',
    'accessToken',
    'signedUrl',
  ])
    expect(schema.properties).not.toHaveProperty(field);
});
