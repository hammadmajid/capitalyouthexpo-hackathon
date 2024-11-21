import { beforeEach, expect, it, vi } from 'vitest';
import { limitAuthentication } from './rate-limit.js';
import { parseEnvironment } from '../config.js';
import { testKeys } from '../../test/keys.js';
const config = parseEnvironment({
  ...testKeys(),
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  CORS_ORIGINS: 'http://localhost:3000',
  AUTH_IP_RATE_LIMIT: 2,
  AUTH_IDENTIFIER_RATE_LIMIT: 2,
});
const increment = vi.fn();
const header = vi.fn();
const request = {
  method: 'POST',
  url: '/v1/auth/login',
  ip: '127.0.0.1',
  body: { identifier: ' USER@example.com ' },
};
const run = (input = request) =>
  limitAuthentication(config, { increment }, input, { header }, 1000);
beforeEach(() => {
  vi.resetAllMocks();
  increment.mockResolvedValue(1);
});
it('SEC: auth IP and normalized identifiers have separate opaque Redis keys and windows', async () => {
  await run();
  expect(increment).toHaveBeenCalledTimes(2);
  const calls = increment.mock.calls;
  expect(calls[0]?.[1]).toBe(60);
  expect(calls[1]?.[1]).toBe(600);
  expect(JSON.stringify(calls)).not.toContain('USER@example.com');
  expect(JSON.stringify(calls)).not.toContain('127.0.0.1');
  const identifierKey = calls[1]?.[0];
  increment.mockClear();
  await run({ ...request, ip: '127.0.0.2', body: { identifier: 'user@example.com' } });
  expect(increment.mock.calls[1]?.[0]).toBe(identifierKey);
});
it('SEC: limit boundary is allowed, exceeded IP or identifier is rejected with retry metadata', async () => {
  increment.mockResolvedValue(2);
  await run();
  increment.mockResolvedValueOnce(3);
  await expect(run()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect(header).toHaveBeenLastCalledWith('Retry-After', 59);
  increment.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
  await expect(run()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect(header).toHaveBeenLastCalledWith('Retry-After', 599);
});
it('SEC: dependency failure is closed, while unrelated routes and methods do not consume auth quotas', async () => {
  increment.mockRejectedValueOnce(new Error('Redis private connection detail'));
  await expect(run()).rejects.toMatchObject({ code: 'INTERNAL', status: 503 });
  increment.mockClear();
  await run({ ...request, method: 'GET' });
  await run({ ...request, url: '/v1/me' });
  expect(increment).not.toHaveBeenCalled();
});
it('SEC: malformed/empty body still consumes IP budget and email/phone use opaque identifier budgets', async () => {
  for (const body of [{ identifier: '' }, { identifier: 'x'.repeat(255) }]) {
    increment.mockClear();
    await run({ ...request, body });
    expect(increment).toHaveBeenCalledTimes(1);
  }
  for (const body of [{ email: 'user@example.com' }, { phone: '+923001234567' }]) {
    increment.mockClear();
    await limitAuthentication(config, { increment }, { ...request, body }, { header }, 1000);
    expect(increment).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(increment.mock.calls)).not.toContain(Object.values(body)[0]);
  }
});

it('SEC: canonical route metadata prevents encoded path quota bypass and unknown paths use IP only', async () => {
  await limitAuthentication(
    config,
    { increment },
    { ...request, url: '/v1/auth/%6cogin', routeOptions: { url: '/v1/auth/login' } },
    { header },
  );
  expect(increment).toHaveBeenCalledTimes(2);
  increment.mockClear();
  await run({ ...request, url: '/v1/auth/unknown-user@example.com' });
  expect(increment).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(increment.mock.calls)).not.toContain('unknown-user@example.com');
});

it.each(['identifier', 'phone'])(
  'SEC / CHG-006: all Pakistani mobile aliases share the %s rate bucket',
  async (field) => {
    const keys: unknown[] = [];
    for (const phone of ['03001234567', '923001234567', '+923001234567']) {
      increment.mockClear();
      await limitAuthentication(
        config,
        { increment },
        { ...request, body: { [field]: phone } },
        { header },
        1000,
      );
      keys.push(increment.mock.calls[1]?.[0]);
      expect(JSON.stringify(increment.mock.calls)).not.toContain(phone);
    }
    expect(new Set(keys).size).toBe(1);
  },
);

it('AUTH-C-001/002 SEC: staged start and verification use canonical opaque email budgets', async () => {
  for (const route of ['start', 'verify']) {
    increment.mockClear();
    const check = (email: string) =>
      limitAuthentication(
        config,
        { increment },
        {
          ...request,
          url: '/v1/auth/registration/' + route,
          body: { email },
        },
        { header },
        1000,
      );
    await check('NEW@example.test');
    expect(increment).toHaveBeenCalledTimes(2);
    const first = increment.mock.calls[1]?.[0];
    increment.mockClear();
    await check('new@example.test');
    expect(increment.mock.calls[1]?.[0]).toBe(first);
    expect(JSON.stringify(increment.mock.calls)).not.toContain('new@example.test');
  }
});

it.each(['email/associate', 'email/associate/verify'])(
  'AUTH-M SEC: %s consumes opaque IP and normalized email quotas',
  async (route) => {
    await limitAuthentication(
      config,
      { increment },
      { ...request, url: '/v1/auth/' + route, body: { email: 'MANAGER@example.test' } },
      { header },
      1000,
    );
    expect(increment).toHaveBeenCalledTimes(2);
    const first = increment.mock.calls[1]?.[0];
    increment.mockClear();
    await limitAuthentication(
      config,
      { increment },
      { ...request, url: '/v1/auth/' + route, body: { email: 'manager@example.test' } },
      { header },
      1000,
    );
    expect(increment.mock.calls[1]?.[0]).toBe(first);
    expect(JSON.stringify(increment.mock.calls)).not.toContain('manager@example.test');
  },
);
