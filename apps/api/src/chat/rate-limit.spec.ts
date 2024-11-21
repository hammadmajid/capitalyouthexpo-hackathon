import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { parseEnvironment } from '../config.js';
import { limitChat } from './rate-limit.js';
const config = parseEnvironment({
  DATABASE_URL: 'postgres://user:pass@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  CHAT_SEND_RATE_LIMIT: '2',
});
it.each([
  '/v1/me/conversations',
  '/v1/me/conversations/thread/messages',
  '/v1/branches/branch/conversations/thread/messages',
  '/v1/me/reports',
  '/v1/branches/branch/conversations/thread/reports',
])('COMM-001: chat mutations use Redis-backed HMAC IP limits (%s)', async (url) => {
  const increment = vi.fn().mockResolvedValue(2),
    header = vi.fn(),
    ip = '203.0.113.10';
  await limitChat(config, { increment }, { method: 'POST', url, ip }, { header }, 1000);
  expect(increment).toHaveBeenCalledWith(expect.stringMatching(/^chat-send:[a-f0-9]{64}:0$/), 60);
  expect(JSON.stringify(increment.mock.calls)).not.toContain(ip);
  increment.mockResolvedValue(3);
  await expect(
    limitChat(config, { increment }, { method: 'POST', url, ip }, { header }, 1000),
  ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  expect(header).toHaveBeenCalledWith('Retry-After', 59);
});
it.each([
  { method: 'GET', url: '/v1/me/conversations' },
  { method: 'POST', url: '/v1/me/conversations/thread/read' },
  { method: 'POST', url: '/v1/me/visits' },
])(
  'COMM-001: separate chat send limits do not throttle unrelated reads/commands',
  async (request) => {
    const increment = vi.fn();
    await limitChat(config, { increment }, { ...request, ip: '203.0.113.10' }, { header: vi.fn() });
    expect(increment).not.toHaveBeenCalled();
  },
);
it('COMM-001 / SEC-003: unavailable Redis denies chat mutations without provider detail', async () => {
  await expect(
    limitChat(
      config,
      { increment: vi.fn().mockRejectedValue(new Error('Provider secret')) },
      { method: 'POST', url: '/v1/me/conversations', ip: '203.0.113.10' },
      { header: vi.fn() },
    ),
  ).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 503,
    message: 'Required dependency unavailable',
  });
});
