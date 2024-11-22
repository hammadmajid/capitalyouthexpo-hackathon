import { apiTelemetry } from '../../src/observability/sdk.js';
import { installApiReporter } from '../../src/observability/reporter.js';
import { telemetryCollector } from '../telemetry-collector.js';
import { testKeys } from '../keys.js';
import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApplication } from '../../src/app.js';
import { Public, Self } from '../../src/access.js';
import { parseEnvironment } from '../../src/config.js';
import { zodPipe } from '../../src/problem.js';
import type { Infrastructure } from '../../src/infrastructure.js';

// Coverage-instrumented Nest bootstrap can exceed Vitest's default on Windows.
vi.setConfig({ testTimeout: 30000 });

@Controller('probe')
class ProbeController {
  @Public() @Get() read() {
    return { ok: true };
  }
  @Public() @Get('failure') fail() {
    throw new Error('private SQL password secret');
  }
  @Public() @Post() write(
    @Body(zodPipe(z.object({ name: z.string() }).strict())) body: { name: string },
  ) {
    return body;
  }
  @Self() @Get('protected') protected() {
    return {};
  }
}
const configuration = {
  ...testKeys(),
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
};
const applications: NestFastifyApplication[] = [];
const dependencies = (): Infrastructure => ({
  postgres: vi.fn().mockResolvedValue(undefined),
  redis: vi.fn().mockResolvedValue(undefined),
  increment: vi.fn().mockResolvedValue(1),
  close: vi.fn().mockResolvedValue(undefined),
});
async function setup(overrides = {}, infrastructure = dependencies()) {
  const app = await createApplication(
    parseEnvironment({ ...configuration, ...overrides }),
    infrastructure,
    [ProbeController],
  );
  applications.push(app);
  return { app, server: app.getHttpAdapter().getInstance(), infrastructure };
}
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('SEC-001: real NestJS/Fastify HTTP foundation', () => {
  it('serves versioned health, request IDs and security headers', async () => {
    const { server } = await setup();
    const response = await server.inject({
      url: '/v1/health/live',
      headers: { 'x-request-id': 'client_123' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'alive' });
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
    );
    expect(response.headers['x-request-id']).not.toBe('client_123');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect((await server.inject('/health/live')).statusCode).toBe(404);
  });
  it.each(['database', 'redis', 'both'])(
    'keeps liveness alive during %s failure and reports readiness 503',
    async (failure) => {
      const infrastructure = dependencies();
      if (failure !== 'redis')
        infrastructure.postgres = vi.fn().mockRejectedValue(new Error('private host'));
      if (failure !== 'database')
        infrastructure.redis = vi.fn().mockRejectedValue(new Error('private host'));
      const { server } = await setup({}, infrastructure);
      expect((await server.inject('/v1/health/live')).statusCode).toBe(200);
      const ready = await server.inject('/v1/health/ready');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'unavailable',
        dependencies: {
          postgres: failure === 'redis',
          redis: failure === 'database',
        },
      });
      expect(ready.body).not.toContain('private');
    },
  );
  it('reports both required dependencies ready', async () => {
    const { server } = await setup();
    expect((await server.inject('/v1/health/ready')).json()).toEqual({
      status: 'ready',
      dependencies: { postgres: true, redis: true },
    });
  });
  it('sanitizes exceptions, rejects unknown input and denies unannotated routes', async () => {
    const { server } = await setup();
    const failure = await server.inject('/v1/probe/failure');
    expect(failure.statusCode).toBe(500);
    expect(failure.headers['content-type']).toContain('application/problem+json');
    expect(failure.body).not.toMatch(/SQL|password|secret|stack/);
    expect(failure.json()).toMatchObject({ code: 'INTERNAL', traceId: expect.any(String) });
    expect((await server.inject('/v1/probe/protected')).statusCode).toBe(401);
    const invalid = await server.inject({
      method: 'POST',
      url: '/v1/probe',
      payload: { name: 'valid', surprise: 'secret' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: 'VALIDATION_FAILED', errors: expect.any(Array) });
    const valid = await server.inject({
      method: 'POST',
      url: '/v1/probe',
      payload: { name: 'valid' },
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json()).toEqual({ name: 'valid' });
  });
  it('allows configured browser origins, rejects others and handles preflight', async () => {
    const { server } = await setup();
    const allowed = await server.inject({
      url: '/v1/health/live',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await server.inject({
      url: '/v1/health/live',
      headers: { origin: 'https://foreign.invalid' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await server.inject({
      method: 'OPTIONS',
      url: '/v1/probe',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.statusCode).toBe(204);
  });
  it('limits request bodies and handles malformed JSON through problem responses', async () => {
    const { server } = await setup({ BODY_LIMIT_BYTES: 256 });
    const oversized = await server.inject({
      method: 'POST',
      url: '/v1/probe',
      payload: { name: 'x'.repeat(300) },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.headers['content-type']).toContain('application/problem+json');
    const invalid = await server.inject({
      method: 'POST',
      url: '/v1/probe',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(invalid.statusCode).toBe(400);
  });
  it('rate limits through the shared counter and fails closed when Redis fails', async () => {
    const infrastructure = dependencies();
    infrastructure.increment = vi.fn().mockResolvedValue(121);
    const { server } = await setup({}, infrastructure);
    const limited = await server.inject('/v1/probe');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    infrastructure.increment = vi.fn().mockRejectedValue(new Error('redis password hidden'));
    const unavailable = await server.inject('/v1/probe');
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.body).not.toContain('password');
    expect((await server.inject('/v1/health/live')).statusCode).toBe(200);
  });
  it.each(['development', 'test', 'staging', 'production'])(
    'gates OpenAPI in %s',
    async (environment) => {
      const { server } = await setup({
        APP_ENV: environment,
        CORS_ORIGINS: 'https://web.example.invalid',
      });
      const response = await server.inject('/v1/docs-json');
      expect(response.statusCode).toBe(['development', 'test'].includes(environment) ? 200 : 404);
      if (response.statusCode === 200)
        expect(response.json()).toMatchObject({
          paths: expect.objectContaining({ '/v1/health/live': expect.any(Object) }),
        });
    },
  );
});

it('SEC-001/003: a real telemetry outage does not change HTTP errors or default-deny authorization', async () => {
  const collector = await telemetryCollector(503);
  const telemetry = apiTelemetry({ environment: 'test', service: 'api', dsn: collector.dsn });
  const reset = installApiReporter(telemetry.report);
  try {
    const { server } = await setup();
    const failed = await server.inject('/v1/probe/failure');
    expect(failed.statusCode).toBe(500);
    expect(failed.json()).toMatchObject({
      code: 'INTERNAL',
      title: 'An unexpected error occurred',
    });
    expect(failed.body).not.toContain('private');
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    expect((await server.inject('/v1/probe/protected')).statusCode).toBe(401);
    expect((await server.inject('/v1/health/live')).statusCode).toBe(200);
    expect((await server.inject('/v1/authenticated-unknown')).statusCode).toBe(404);
  } finally {
    reset();
    await telemetry.close();
    await collector.close();
  }
});
