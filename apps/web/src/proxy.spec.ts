// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
afterEach(() => vi.unstubAllEnvs());
it('SEC-001: guests cannot enter protected pages before session restoration', () => {
  const result = proxy(new NextRequest('http://localhost:3000/app/owner'));
  expect(result.status).toBe(307);
  expect(result.headers.get('location')).toBe(
    'http://localhost:3000/login?returnTo=' + encodeURIComponent('/app/owner'),
  );
});
it.each(['hsm_access', 'hsm_refresh', '__Host-hsm_access', '__Host-hsm_refresh'])(
  'SEC-001: cookie presence permits restoration but does not grant a capability',
  (name) => {
    const result = proxy(
      new NextRequest('http://localhost:3000/app/owner', {
        headers: { cookie: name + '=unverified' },
      }),
    );
    expect(result.headers.get('location')).toBeNull();
  },
);
it('SEC-001: production scripts use fresh nonces without eval and reject framing', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_ENV', 'production');
  const first = proxy(new NextRequest('https://example.com/login'));
  const second = proxy(new NextRequest('https://example.com/login'));
  const policy = first.headers.get('content-security-policy');
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toContain("'nonce-");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toBe(second.headers.get('content-security-policy'));
  expect(first.headers.get('strict-transport-security')).toBe(
    'max-age=31536000; includeSubDomains',
  );
  expect(first.headers.get('cache-control')).toBe('no-store');
});
it('SEC-001: development permits framework eval without relaxing framing or object policy', () => {
  vi.stubEnv('NODE_ENV', 'development');
  const result = proxy(new NextRequest('http://localhost:3000/login'));
  expect(result.headers.get('content-security-policy')).toContain("'unsafe-eval'");
  expect(result.headers.get('content-security-policy')).toContain("object-src 'none'");
  expect(result.headers.get('strict-transport-security')).toBeNull();
});

it('SEC-003: CSP admits only the validated public collector origin without DSN credentials', () => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://' + 'a'.repeat(32) + '@collector.example.test/12');
  const result = proxy(new NextRequest('https://example.com/login'));
  const policy = result.headers.get('content-security-policy');
  expect(policy).toContain("connect-src 'self' https://collector.example.test;");
  expect(policy).not.toContain('a'.repeat(32));
  expect(policy).not.toContain('@collector');
});
it('SEC-003: deployed CSP refuses insecure or credential-bearing collector configuration', () => {
  vi.stubEnv('APP_ENV', 'production');
  for (const dsn of [
    'http://' + 'a'.repeat(32) + '@127.0.0.1/12',
    'https://' + 'a'.repeat(32) + ':PRIVATE@collector.example.test/12',
  ]) {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
    expect(() => proxy(new NextRequest('https://example.com/login'))).toThrow(
      'Invalid observability configuration',
    );
  }
});

it('SEC-001: unknown protected destinations and sensitive queries never enter authentication return state', () => {
  const unknownUrl = new URL('/app/unsupported', 'http://localhost:3000');
  unknownUrl.searchParams.set('refresh', 'PRIVATE');
  const unsupported = proxy(new NextRequest(unknownUrl));
  expect(unsupported.headers.get('location')).toBe('http://localhost:3000/login');
  const protectedUrl = new URL('/app/security', 'http://localhost:3000');
  protectedUrl.searchParams.set('refresh', 'PRIVATE');
  const supported = proxy(new NextRequest(protectedUrl));
  expect(supported.headers.get('location')).toBe(
    'http://localhost:3000/login?returnTo=' + encodeURIComponent('/app/security'),
  );
  expect(supported.headers.get('location')).not.toContain('PRIVATE');
});

it('AUTH-C CHG-006 SEC: private browser uploads admit only the configured storage origin', () => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('WEB_UPLOAD_ORIGIN', 'https://private-storage.example.test');
  const policy = proxy(new NextRequest('https://app.example.test/login')).headers.get(
    'content-security-policy',
  );
  expect(policy).toContain("connect-src 'self' https://private-storage.example.test;");
  expect(policy).not.toContain('https:;');
  expect(policy).not.toContain('*');
});
it('SEC: configured private-storage CSP rejects credentials and signed paths', () => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('WEB_UPLOAD_ORIGIN', 'https://storage.example.test?signature=PRIVATE');
  expect(() => proxy(new NextRequest('https://app.example.test/login'))).toThrow(
    'Invalid private upload origin',
  );
});

it('ONB-001 SEC: only authenticated app pages permit the fixed map origin and isolated blob worker', () => {
  vi.stubEnv('NODE_ENV', 'production');
  const owner = proxy(new NextRequest('https://app.example.test/app/owner')).headers.get(
    'content-security-policy',
  );
  expect(owner).toContain('https://tiles.openfreemap.org');
  expect(owner).toContain("worker-src 'self' blob:");
  expect(owner).toContain("img-src 'self' data: blob: https://tiles.openfreemap.org;");
  expect(owner).not.toContain('script-src blob:');
  expect(owner).not.toContain("'unsafe-eval'");
  const login = proxy(new NextRequest('https://app.example.test/login')).headers.get(
    'content-security-policy',
  );
  expect(login).not.toContain('tiles.openfreemap.org');
  expect(login).toContain("worker-src 'self';");
  // Client navigation from another app page keeps the first document's policy.
  for (const path of [
    '/app',
    '/app/owner-profile',
    '/app/customer',
    '/vendor/maplibre-gl-worker.mjs',
  ])
    expect(
      proxy(new NextRequest('https://app.example.test' + path)).headers.get(
        'content-security-policy',
      ),
    ).toContain(' https://tiles.openfreemap.org');
  for (const path of ['/', '/hostels/x', '/share/x', '/application'])
    expect(
      proxy(new NextRequest('https://app.example.test' + path)).headers.get(
        'content-security-policy',
      ),
    ).not.toContain('tiles.openfreemap.org');
  expect(
    proxy(new NextRequest('https://app.example.test/app/owner-profile')).headers.get(
      'content-security-policy',
    ),
  ).toContain(' https://tiles.openfreemap.org');
});
