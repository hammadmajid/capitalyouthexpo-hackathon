import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthCrypto } from './crypto.js';
import { AuthTransport } from './transport.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const transport = new AuthTransport(crypto, false);
function request(method = 'GET', cookies = {}, headers = {}) {
  return { method, cookies, headers } as FastifyRequest;
}
function reply() {
  return { header: vi.fn(), setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply;
}
const credentials = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 600,
  sessionId: 'session',
  client: 'web' as const,
};
it('SEC: web credentials stay in protected cookies and deployed cookies use host prefix', () => {
  for (const secure of [false, true]) {
    const response = reply();
    const body = new AuthTransport(crypto, secure).send(response, credentials);
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(response.setCookie).toHaveBeenCalledWith(
      (secure ? '__Host-' : '') + 'hsm_access',
      'access',
      { path: '/', secure, sameSite: 'lax', httpOnly: true, maxAge: 600 },
    );
    expect(response.setCookie).toHaveBeenCalledWith(
      (secure ? '__Host-' : '') + 'hsm_csrf',
      crypto.digest('refresh', 'csrf'),
      expect.objectContaining({ httpOnly: false, secure }),
    );
  }
});
it('SEC: mobile credentials are returned without cookies and responses cannot be cached', () => {
  const response = reply();
  const value = { ...credentials, client: 'mobile' as const };
  expect(transport.send(response, value)).toBe(value);
  expect(response.setCookie).not.toHaveBeenCalled();
  expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
it('SEC: bearer and cookie authentication are explicit and ambiguous or malformed input fails', () => {
  expect(transport.token(request('GET', {}, { authorization: 'Bearer token' }), 'access')).toBe(
    'token',
  );
  expect(transport.token(request('GET', { hsm_access: 'cookie' }), 'access')).toBe('cookie');
  for (const authorization of ['Basic value', 'Bearer ', 'Bearer two tokens'])
    expect(() => transport.token(request('GET', {}, { authorization }), 'access')).toThrow();
  expect(() =>
    transport.token(
      request('GET', { hsm_access: 'cookie' }, { authorization: 'Bearer token' }),
      'access',
    ),
  ).toThrow('Ambiguous');
  expect(() => transport.token(request(), 'access')).toThrow();
  expect(() =>
    transport.token(request('POST', {}, { authorization: 'Bearer token' }), 'refresh'),
  ).toThrow();
});
it('SEC: unsafe cookie requests require a double-submit token bound to the refresh credential', () => {
  const csrf = crypto.digest('refresh', 'csrf');
  const cookies = { hsm_access: 'access', hsm_refresh: 'refresh', hsm_csrf: csrf };
  expect(transport.token(request('POST', cookies, { 'x-csrf-token': csrf }), 'access')).toBe(
    'access',
  );
  expect(transport.token(request('POST', cookies, { 'x-csrf-token': csrf }), 'refresh')).toBe(
    'refresh',
  );
  for (const headers of [{}, { 'x-csrf-token': 'wrong' }, { 'x-csrf-token': [csrf] }])
    expect(() => transport.token(request('POST', cookies, headers), 'access')).toThrow('CSRF');
  expect(() =>
    transport.token(request('POST', { hsm_access: 'access' }, { 'x-csrf-token': csrf }), 'access'),
  ).toThrow();
  expect(() =>
    transport.token(
      request('POST', { ...cookies, hsm_refresh: 'other' }, { 'x-csrf-token': csrf }),
      'access',
    ),
  ).toThrow();
  for (const method of ['GET', 'HEAD', 'OPTIONS'])
    expect(transport.token(request(method, cookies), 'access')).toBe('access');
});
it('SEC: logout clears all cookie paths and blocks caching', () => {
  const response = reply();
  transport.clear(response);
  expect(response.clearCookie).toHaveBeenCalledTimes(3);
  expect(response.clearCookie).toHaveBeenCalledWith('hsm_refresh', {
    path: '/',
    secure: false,
    sameSite: 'lax',
  });
  expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

it('AUTH-C: web login returns the projected identity/capabilities alongside cookie metadata', () => {
  const profile = {
    user: {
      id: 'identity',
      fullName: 'Self',
      email: 'self@example.com',
      emailVerified: true,
      cnicLast4: '5671',
    },
    capabilities: { customer: true, owner: false, managerOf: [], admin: null },
  };
  expect(transport.send(reply(), { ...credentials, ...profile })).toMatchObject(profile);
});
