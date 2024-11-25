import { randomUUID } from 'node:crypto';
import { problemSchema, REPORT_TRUNCATED_HEADER, PROFILE_REVIEWS_HEADER } from '@hsm/contracts';
import type { WebConfig } from './config';
const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
// x-forwarded-for carries the edge proxy's client address; the API honours it only from
// addresses listed in TRUST_PROXY, so web users do not share one rate-limit bucket.
const forwarded = [
  PROFILE_REVIEWS_HEADER,
  'cookie',
  'content-type',
  'x-csrf-token',
  'idempotency-key',
  'if-match',
  'x-forwarded-for',
];
const returned = [
  'etag',
  'content-type',
  // RPT-001/002: report CSV/PDF downloads keep their attachment filename.
  'content-disposition',
  REPORT_TRUNCATED_HEADER,
  'x-request-id',
  'retry-after',
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
];
function problem(status: number, code: 'FORBIDDEN' | 'VALIDATION_FAILED' | 'INTERNAL') {
  return Response.json(
    {
      type: 'https://hsm.example/problems/' + code.toLowerCase(),
      title: status === 503 ? 'Service unavailable' : 'Request rejected',
      status,
      code,
      detail: status === 503 ? 'Required service unavailable' : 'Invalid request',
      traceId: randomUUID(),
    },
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );
}
async function body(request: Request) {
  if (safe.has(request.method) || !request.body) return undefined;

  const stream = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await stream.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 1048576) throw new Error('Body too large');
      chunks.push(part.value);
    }
  } finally {
    await stream.cancel();
    stream.releaseLock();
  }
  if (length === 0) return undefined;
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new Error('Invalid content type');
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function expireRevokedCookies(headers: Headers, secure: boolean) {
  for (const kind of ['access', 'refresh', 'csrf']) {
    const name = (secure ? '__Host-' : '') + 'hsm_' + kind;
    headers.append(
      'set-cookie',
      name +
        '=; Path=/; Max-Age=0; SameSite=Lax' +
        (kind === 'csrf' ? '' : '; HttpOnly') +
        (secure ? '; Secure' : ''),
    );
  }
}
// Profile kinds are contract values; keep the underscore exception local to this route.
function validSegment(segment: string, index: number, segments: string[]) {
  return (
    /^[a-zA-Z0-9-]+$/.test(segment) ||
    (segment === 'profile_photo' &&
      index === 2 &&
      segments[1] === 'profile-reviews' &&
      (segments[0] === 'me' || segments[0] === 'admin'))
  );
}
export async function proxyApi(
  request: Request,
  segments: string[],
  config: WebConfig,
  transport: typeof fetch = fetch,
) {
  if (
    !segments.length ||
    segments.some((segment, index) => !validSegment(segment, index, segments))
  )
    return problem(400, 'VALIDATION_FAILED');
  if (!safe.has(request.method) && request.headers.get('origin') !== config.WEB_ORIGIN)
    return problem(403, 'FORBIDDEN');
  let payload: Awaited<ReturnType<typeof body>>;
  try {
    payload = await body(request);
  } catch {
    return problem(400, 'VALIDATION_FAILED');
  }
  const url = new URL('/v1/' + segments.join('/'), config.API_ORIGIN);
  url.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of forwarded) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (payload === undefined) headers.delete('content-type');
  headers.set('origin', config.WEB_ORIGIN);
  headers.set('accept', 'application/json, application/problem+json');
  let upstream: Response;
  try {
    upstream = await transport(url, {
      method: request.method,
      headers,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      ...(payload ? { body: payload } : {}),
    });
  } catch {
    return problem(503, 'INTERNAL');
  }
  const output = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const name of returned) {
    const value = upstream.headers.get(name);
    if (value) output.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) output.append('set-cookie', cookie);
  if (upstream.status === 401) {
    const failure = (await upstream
      .clone()
      .json()
      .catch(() => undefined)) as unknown;
    const parsed = problemSchema.safeParse(failure);
    if (parsed.success && parsed.data.status === 401 && parsed.data.code === 'SESSION_REVOKED')
      expireRevokedCookies(output, ['staging', 'production'].includes(config.APP_ENV));
  }
  return new Response(upstream.body, { status: upstream.status, headers: output });
}
