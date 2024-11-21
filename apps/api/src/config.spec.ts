import { testKeys } from '../test/keys.js';
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './config.js';
const base = {
  ...testKeys(),
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  CORS_ORIGINS: 'http://localhost:3000',
};
describe('SEC-001: environment boundary', () => {
  it('VISIT-001: approved Phase3 visits are enabled by default and retain an explicit operational disable switch', () => {
    expect(parseEnvironment(base).VISITS_ENABLED).toBe(true);
    expect(parseEnvironment({ ...base, VISITS_ENABLED: 'false' }).VISITS_ENABLED).toBe(false);
    expect(parseEnvironment({ ...base, VISITS_ENABLED: 'true' }).VISITS_ENABLED).toBe(true);
  });
  it('validates once and freezes usable configuration', () => {
    const parsed = parseEnvironment(base);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.TRUST_PROXY).toBe(false);
    expect(parsed.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(parseEnvironment({ ...base, TRUST_PROXY: '127.0.0.1, ::1' }).TRUST_PROXY).toEqual([
      '127.0.0.1',
      '::1',
    ]);
  });
  it.each([
    { JWT_SECRET: undefined },
    { JWT_SECRET: 'short-secret' },
    { CNIC_HASH_KEY: 'invalid' },
    { CNIC_ENCRYPTION_KEY: base.CNIC_HASH_KEY },
    { DATABASE_URL: 'https://secret.invalid' },
    { REDIS_URL: 'https://secret.invalid' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'https://web.invalid/path' },
    { API_PORT: '70000' },
    { AUTH_IP_RATE_LIMIT: '0' },
    { AUTH_IDENTIFIER_RATE_LIMIT: '10001' },
    { BODY_LIMIT_BYTES: '0' },
    { TRUST_PROXY: 'true' },
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { NODE_ENV: 'production' },
  ])('rejects unsafe configuration without revealing supplied values: %j', (change) => {
    expect(() => parseEnvironment({ ...base, ...change })).toThrow('Invalid API configuration');
    try {
      parseEnvironment({ ...base, ...change });
    } catch (error) {
      expect(String(error)).not.toContain('secret.invalid');
    }
  });
  it('accepts production with explicit HTTPS origins and trusted proxy IPs', () => {
    expect(
      parseEnvironment({ ...base, APP_ENV: 'production', CORS_ORIGINS: 'https://web.invalid' })
        .APP_ENV,
    ).toBe('production');
  });
});
