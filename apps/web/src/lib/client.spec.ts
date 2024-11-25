import { afterEach, expect, it, vi } from 'vitest';
import { browserClient, csrfCookie } from './client';
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'hsm_csrf=; Max-Age=0; Path=/';
});
it('SEC-001: readable CSRF parsing prefers the secure cookie and never reads credentials', () => {
  expect(csrfCookie('hsm_access=private; hsm_csrf=local; __Host-hsm_csrf=secure%20value')).toBe(
    'secure value',
  );
  expect(csrfCookie('other=value; hsm_csrf=local')).toBe('local');
  expect(csrfCookie('hsm_access=private; hsm_refresh=private')).toBeUndefined();
  expect(csrfCookie('__Host-hsm_csrf=%XX; hsm_csrf=local')).toBeUndefined();
});
it('SEC-001: the browser adapter sends same-origin cookie requests with the live CSRF value', async () => {
  document.cookie = 'hsm_csrf=browser-value; Path=/';
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ revoked: true }));
  vi.stubGlobal('fetch', transport);
  await browserClient().POST('/v1/auth/logout', {});
  const request = transport.mock.calls[0]?.[0];
  expect(request instanceof Request).toBe(true);
  if (!(request instanceof Request)) throw new Error('Request missing');
  expect(request.url).toBe(window.location.origin + '/api/v1/auth/logout');
  expect(request.headers.get('x-csrf-token')).toBe('browser-value');
  expect(request.headers.has('authorization')).toBe(false);
  expect(request.credentials).toBe('include');
});
