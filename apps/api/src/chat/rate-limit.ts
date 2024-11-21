import { createHmac } from 'node:crypto';
import { DomainError } from '@hsm/contracts';
import type { FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Infrastructure } from '../infrastructure.js';
export async function limitChat(
  config: ApiConfig,
  infrastructure: Pick<Infrastructure, 'increment'>,
  request: Pick<FastifyRequest, 'method' | 'url' | 'ip'>,
  reply: { header(name: string, value: number): unknown },
  now = Date.now(),
) {
  const path = request.url.split('?')[0] ?? '';
  if (
    request.method !== 'POST' ||
    !/^\/v1\/(?:me\/reports|(?:me|branches\/[^/]+)\/conversations(?:\/[^/]+\/(?:messages|reports))?)$/.test(
      path,
    )
  )
    return;
  const window = Math.floor(now / 60000),
    digest = createHmac('sha256', config.JWT_SECRET).update(request.ip).digest('hex');
  let count: number;
  try {
    count = await infrastructure.increment('chat-send:' + digest + ':' + window, 60);
  } catch {
    throw new DomainError('INTERNAL', 503, 'Required dependency unavailable');
  }
  if (count > config.CHAT_SEND_RATE_LIMIT) {
    reply.header('Retry-After', Math.ceil(((window + 1) * 60000 - now) / 1000));
    throw new DomainError('RATE_LIMITED', 429, 'Rate limit exceeded');
  }
}
