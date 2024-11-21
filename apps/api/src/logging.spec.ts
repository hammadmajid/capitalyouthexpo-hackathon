import { PassThrough, Writable } from 'node:stream';
import fastify from 'fastify';
import pino from 'pino';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { testKeys } from '../test/keys.js';
import { parseEnvironment } from './config.js';
import { logging, requestId } from './logging.js';
const configuration = () =>
  parseEnvironment({
    ...testKeys(),
    APP_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'info',
  });
const privateValue = 'private_sensitive_value';
function destination() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream };
}
it('SEC-003: actual HTTP request correlation never reflects an untrusted client identifier', async () => {
  const { lines, stream } = destination();
  const app = fastify({
    loggerInstance: pino(logging(configuration()), stream),
    requestIdHeader: false,
    genReqId: requestId,
  });
  app.get('/probe', (request) => ({ traceId: request.id }));
  try {
    const response = await app.inject({
      url: '/probe',
      headers: { 'x-request-id': privateValue },
    });
    const body = z.object({ traceId: z.string().uuid() }).parse(response.json());
    expect(body.traceId).not.toBe(privateValue);
    expect(lines.join('')).not.toContain(privateValue);
  } finally {
    await app.close();
  }
});
it('SEC-003: real Fastify logs canonical routes instead of private URL segments or queries', async () => {
  const { lines, stream } = destination();
  const app = fastify({ loggerInstance: pino(logging(configuration()), stream) });
  app.get('/probe/:identity', () => ({ ok: true }));
  try {
    await app.inject('/probe/' + privateValue + '?password=' + privateValue);
    await app.inject('/unmatched/' + privateValue);
    expect(lines.join('')).not.toContain(privateValue);
    expect(lines.join('')).toContain('/probe/:identity');
  } finally {
    await app.close();
  }
});
it('SEC-003: actual Pino error serialization cannot disclose exception text, stack or cause', () => {
  const { lines, stream } = destination();
  const logger = pino(logging(configuration()), stream);
  logger.error(
    { err: new Error(privateValue, { cause: new Error(privateValue) }) },
    'Request failed',
  );
  expect(lines.join('')).not.toContain(privateValue);
  expect(lines.join('')).toContain('Unexpected error');
});

it('SEC-003: arbitrary nested fields and formatting arguments are excluded from actual logs', () => {
  const { lines, stream } = destination();
  const logger = pino(logging(configuration()), stream);
  logger.info({ msg: privateValue, extra: { password: privateValue } }, privateValue, privateValue);
  logger.info(privateValue);
  logger.info('%s', privateValue);
  logger.info({ code: '123456', requestId: privateValue }, 'Request failed');
  expect(lines.join('')).not.toContain(privateValue);
  expect(lines.join('')).not.toContain('123456');
  expect(lines.join('')).toContain('Application event');
});
it('SEC-003: known error codes and generated correlation remain useful after privacy filtering', () => {
  const { lines, stream } = destination();
  const logger = pino(logging(configuration()), stream);
  const generated = requestId();
  logger.error({ code: 'INTERNAL', requestId: generated }, 'Request failed');
  expect(lines.join('')).toContain('INTERNAL');
  expect(lines.join('')).toContain(generated);
});
it('SEC-003: malformed log metadata cannot throw or disclose private values', () => {
  const { lines, stream } = destination();
  const logger = pino(logging(configuration()), stream);
  logger.info(
    { req: { method: privateValue }, res: { statusCode: privateValue } },
    'incoming request',
  );
  logger.info({ req: {} }, 'incoming request');
  logger.child({ reqId: privateValue }).info('incoming request');
  expect(lines.join('')).not.toContain(privateValue);
  expect(lines.join('')).toContain('UNMATCHED');
  expect(lines.join('')).toContain('OTHER');
});

it('SEC-003: redacts sensitive structured fields and omits request queries/headers', () => {
  const output = new PassThrough();
  let captured = '';
  output.on('data', (chunk: Buffer) => {
    captured += chunk.toString();
  });
  const logger = pino(
    logging(
      parseEnvironment({
        ...testKeys(),
        DATABASE_URL: 'postgres://localhost/test',
        REDIS_URL: 'redis://localhost',
        CORS_ORIGINS: 'http://localhost:3000',
      }),
    ),
    output,
  );
  logger.info({
    password: 'sensitive-value',
    data: { cnic: 'sensitive-value', otp: 'sensitive-value' },
    req: {
      method: 'POST',
      url: '/v1/auth?password=sensitive-value',
      headers: { authorization: 'sensitive-value' },
    },
  });
  expect(captured).not.toContain('sensitive-value');
  expect(captured).toContain('[REDACTED]');
});
it('SEC-001: rejects hostile request IDs and creates server IDs', () => {
  const request = { headers: { 'x-request-id': 'contains spaces' } };
  expect(requestId(request)).toMatch(/^[0-9a-f-]{36}$/);
  expect(requestId({ headers: {} })).toMatch(/^[0-9a-f-]{36}$/);
});
