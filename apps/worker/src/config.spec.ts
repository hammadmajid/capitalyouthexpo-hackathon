import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { workerConfig } from './config.js';
const base = {
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  EMAIL_ENVELOPE_KEY: randomBytes(32).toString('hex'),
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_FROM: 'no-reply@example.test',
};
it('VISIT-001 / NTF-002: the approved follow-up scheduler defaults enabled and respects explicit disable', () => {
  expect(workerConfig(base).VISITS_ENABLED).toBe(true);
  expect(workerConfig({ ...base, VISITS_ENABLED: 'false' }).VISITS_ENABLED).toBe(false);
  expect(workerConfig({ ...base, VISITS_ENABLED: 'true' }).VISITS_ENABLED).toBe(true);
});
it('SEC: Mailpit permits unauthenticated SMTP but validates keys and transport URLs', () => {
  expect(workerConfig(base).SMTP_SECURE).toBe(false);
  expect(() =>
    workerConfig({ ...base, CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex') }),
  ).toThrow('CNIC keys');
  expect(() => workerConfig({ ...base, CNIC_HASH_KEY: randomBytes(32).toString('hex') })).toThrow(
    'CNIC keys',
  );
  expect(workerConfig({ ...base, SMTP_USER: '', SMTP_PASSWORD: '' }).SMTP_USER).toBeUndefined();
  expect(() => workerConfig({ ...base, EMAIL_ENVELOPE_KEY: 'invalid' })).toThrow();
  expect(() => workerConfig({ ...base, REDIS_URL: 'https://example.test' })).toThrow();
  expect(() => workerConfig({ ...base, DATABASE_URL: 'https://example.test' })).toThrow();
  expect(() => workerConfig({ ...base, SMTP_USER: 'sender' })).toThrow();
  expect(() => workerConfig({ ...base, NODE_ENV: 'production' })).toThrow();
});
it('SEC: deployed SMTP requires paired credentials and authenticated encryption', () => {
  for (const APP_ENV of ['staging', 'production']) {
    expect(() => workerConfig({ ...base, APP_ENV })).toThrow();
    expect(() =>
      workerConfig({ ...base, APP_ENV, SMTP_USER: 'sender', SMTP_PASSWORD: 'secret' }),
    ).toThrow();
    expect(
      workerConfig({
        ...base,
        APP_ENV,
        NODE_ENV: 'production',
        SMTP_USER: 'sender',
        SMTP_PASSWORD: 'secret',
        SMTP_SECURE: 'true',
      }).SMTP_SECURE,
    ).toBe(true);
    expect(
      workerConfig({
        ...base,
        APP_ENV,
        SMTP_USER: 'sender',
        SMTP_PASSWORD: 'secret',
        SMTP_REQUIRE_TLS: 'true',
      }).SMTP_REQUIRE_TLS,
    ).toBe(true);
  }
});
