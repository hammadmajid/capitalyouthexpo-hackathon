import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { authFixture } from './auth-fixture.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture(crypto, new Date(), {
    AUTH_IP_RATE_LIMIT: 3,
    AUTH_IDENTIFIER_RATE_LIMIT: 2,
  });
});
afterAll(async () => {
  await fixture?.close();
});
it('SEC: real Redis enforces identifier and IP budgets before credential verification', async () => {
  // Fix only the quota clock so minute boundaries cannot make enforcement flaky.
  const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-07T12:00:30Z').getTime());
  try {
    const login = (identifier: string) =>
      fixture.application.inject({
        method: 'POST',
        url: '/v1/auth/login?request=rate-test',
        payload: { identifier, password: 'Unknown secure password phrase', client: 'mobile' },
      });
    expect((await login('unknown-rate@example.com')).statusCode).toBe(401);
    expect((await login('UNKNOWN-RATE@example.com')).statusCode).toBe(401);
    const identifierLimited = await login('unknown-rate@example.com');
    expect(identifierLimited.statusCode).toBe(429);
    expect(identifierLimited.json().code).toBe('RATE_LIMITED');
    expect(Number(identifierLimited.headers['retry-after'])).toBeGreaterThan(0);
    const ipLimited = await login('another-rate@example.com');
    expect(ipLimited.statusCode).toBe(429);
    expect(Number(ipLimited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect((await fixture.application.inject({ url: '/v1/health/live' })).statusCode).toBe(200);
  } finally {
    clock.mockRestore();
  }
});
