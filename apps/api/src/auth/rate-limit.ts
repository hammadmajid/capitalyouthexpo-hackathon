import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { DomainError, pakistaniMobileSchema } from '@hsm/contracts';
import type { FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Infrastructure } from '../infrastructure.js';
const inputSchema = z
  .object({
    identifier: z.string().max(254).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(254).optional(),
  })
  .passthrough();
const identifierRoutes = new Set(
  [
    'login',
    'register',
    'registration/start',
    'registration/verify',
    'email/verify',
    'email/resend',
    'email/associate',
    'email/associate/verify',
    'password/forgot',
    'password/reset',
    'manager/activate',
  ].map((route) => '/v1/auth/' + route),
);
type Request = Pick<FastifyRequest, 'method' | 'url' | 'ip' | 'body'> & {
  routeOptions?: { url: string | undefined };
};
type Reply = { header(name: string, value: string | number): unknown };
export async function limitAuthentication(
  config: ApiConfig,
  infrastructure: Pick<Infrastructure, 'increment'>,
  request: Request,
  reply: Reply,
  now = Date.now(),
) {
  const path = request.routeOptions?.url ?? request.url.split('?')[0] ?? '';
  if (request.method !== 'POST' || !path.startsWith('/v1/auth/')) return;
  const input = inputSchema.safeParse(request.body);
  const identifier =
    identifierRoutes.has(path) && input.success
      ? (input.data.identifier ?? input.data.email ?? input.data.phone)?.trim().toLowerCase()
      : undefined;
  const mobile = pakistaniMobileSchema.safeParse(identifier);
  const canonicalIdentifier = mobile.success ? mobile.data : identifier;
  const plans = [
    { scope: 'ip', value: request.ip, limit: config.AUTH_IP_RATE_LIMIT, seconds: 60 },
    ...(canonicalIdentifier
      ? [
          {
            scope: path,
            value: canonicalIdentifier,
            limit: config.AUTH_IDENTIFIER_RATE_LIMIT,
            seconds: 600,
          },
        ]
      : []),
  ];
  for (const plan of plans) {
    const window = Math.floor(now / (plan.seconds * 1000));
    // SEC: Redis keys never contain a raw email, phone or address.
    const digest = createHmac('sha256', config.JWT_SECRET).update(plan.value).digest('hex');
    let count: number;
    try {
      count = await infrastructure.increment(
        'auth:' + plan.scope + ':' + digest + ':' + window,
        plan.seconds,
      );
    } catch {
      throw new DomainError('INTERNAL', 503, 'Required dependency unavailable');
    }
    if (count > plan.limit) {
      reply.header('Retry-After', Math.ceil(((window + 1) * plan.seconds * 1000 - now) / 1000));
      throw new DomainError('RATE_LIMITED', 429, 'Rate limit exceeded');
    }
  }
}
