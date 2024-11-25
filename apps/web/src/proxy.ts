import { privateUploadOrigin } from './server/config';
import { observabilityConfig } from '@hsm/observability';
import { safeReturnPath } from './lib/return-path';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const telemetry = observabilityConfig({
    environment: process.env.APP_ENV ?? 'development',
    service: 'web',
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const collector = telemetry.dsn ? ' ' + new URL(telemetry.dsn).origin : '';
  const upload = privateUploadOrigin(
    process.env.WEB_UPLOAD_ORIGIN,
    process.env.APP_ENV ?? 'development',
  );
  const storage = upload ? ' ' + upload : '';
  // ONB-001: the app shell keeps the CSP of its first document across client navigation,
  // so every authenticated /app page must allow the fixed map origin used by Owner setup.
  // The self-hosted MapLibre worker gets its own CSP from this response and fetches tiles itself.
  const app =
    request.nextUrl.pathname === '/app' ||
    request.nextUrl.pathname.startsWith('/app/') ||
    request.nextUrl.pathname === '/vendor/maplibre-gl-worker.mjs';
  const maps = app ? ' https://tiles.openfreemap.org' : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" +
      nonce +
      "' 'strict-dynamic'" +
      (development ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:" + (maps ? ' blob:' + maps : ''),
    "worker-src 'self'" + (maps ? ' blob:' : ''),
    "font-src 'self'",
    "connect-src 'self'" + collector + storage + maps + (development ? ' ws: wss:' : ''),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', policy);
  headers.set('x-nonce', nonce);
  const guest =
    request.nextUrl.pathname.startsWith('/app') &&
    !request.cookies.has('hsm_access') &&
    !request.cookies.has('hsm_refresh') &&
    !request.cookies.has('__Host-hsm_access') &&
    !request.cookies.has('__Host-hsm_refresh');
  const login = new URL('/login', request.url);
  const returnPath = safeReturnPath(request.nextUrl.pathname);
  if (guest && returnPath) login.searchParams.set('returnTo', returnPath);
  const response = guest
    ? NextResponse.redirect(login)
    : NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('cache-control', 'no-store');
  if (['staging', 'production'].includes(process.env.APP_ENV ?? ''))
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return response;
}
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
