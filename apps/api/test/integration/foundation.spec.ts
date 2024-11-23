import { testKeys } from '../keys.js';
import { randomBytes } from 'node:crypto';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../../src/app.js';
import { parseEnvironment, type ApiConfig } from '../../src/config.js';
import { LiveInfrastructure } from '../../src/infrastructure.js';
let postgres: StartedTestContainer;
let redis: StartedTestContainer;
let infrastructure: LiveInfrastructure;
let app: NestFastifyApplication;
let config: ApiConfig;
beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  postgres = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_USER: 'hsm_api',
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: 'hsm_api',
    })
    .withExposedPorts(5432)
    // PostGIS initializes with a temporary server before its final TCP listener.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  redis = await new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  config = parseEnvironment({
    ...testKeys(),
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: `postgres://hsm_api:${password}@${postgres.getHost()}:${postgres.getMappedPort(5432)}/hsm_api`,
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    CORS_ORIGINS: 'http://localhost:3000',
    GLOBAL_RATE_LIMIT: 2,
  });
  infrastructure = new LiveInfrastructure(config);
  await infrastructure.connect();
  app = await createApplication(config, infrastructure);
});
afterAll(async () => {
  await app?.close();
  await infrastructure?.close();
  await redis?.stop();
  await postgres?.stop();
});
it('Phase 1: runnable API readiness verifies real PostgreSQL 17/PostGIS and Redis', async () => {
  const response = await app.inject('/v1/health/ready');
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    status: 'ready',
    dependencies: { postgres: true, redis: true },
  });
});
it('SEC-001: Redis rate counters are atomic across concurrent calls and expire', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () => infrastructure.increment('hsm:integration:atomic', 60)),
  );
  expect(results.sort((a, b) => a - b)).toEqual(
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  expect(await infrastructure.cache.ttl('hsm:integration:atomic')).toBeGreaterThan(0);
});
it('SEC-001: the HTTP limiter uses Redis and denies excess requests', async () => {
  expect((await app.inject('/v1/not-found')).statusCode).toBe(404);
  expect((await app.inject('/v1/not-found')).statusCode).toBe(404);
  expect((await app.inject('/v1/not-found')).statusCode).toBe(429);
});
it('Phase 1: application shutdown closes real PostgreSQL and Redis resources', async () => {
  const separate = new LiveInfrastructure(config);
  await separate.connect();
  const application = await createApplication(config, separate);
  await application.close();
  expect(separate.cache.status).toBe('end');
  await expect(separate.postgres()).rejects.toThrow();
});
it('Phase 1: downstream outages affect readiness while liveness remains usable', async () => {
  await redis.stop();
  expect((await app.inject('/v1/health/ready')).json()).toMatchObject({
    status: 'unavailable',
    dependencies: { postgres: true, redis: false },
  });
  expect((await app.inject('/v1/health/live')).statusCode).toBe(200);
  await postgres.stop();
  expect((await app.inject('/v1/health/ready')).json()).toMatchObject({
    dependencies: { postgres: false, redis: false },
  });
  expect((await app.inject('/v1/health/live')).statusCode).toBe(200);
});

it('SEC-001: startup refuses unavailable real dependencies instead of falling back', async () => {
  const separate = new LiveInfrastructure(config);
  await expect(separate.connect()).rejects.toThrow('Required API dependencies unavailable');
  expect(separate.cache.status).toBe('end');
});
