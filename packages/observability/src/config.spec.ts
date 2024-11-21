import { expect, it } from 'vitest';
import { observabilityConfig } from './index.js';
const publicKey = 'a'.repeat(32);
it.each(['development', 'test', 'staging', 'production'] as const)(
  'SEC-003: optional telemetry and HTTPS work in every environment',
  (environment) => {
    for (const service of ['api', 'web', 'mobile'] as const) {
      expect(observabilityConfig({ environment, service }).dsn).toBeUndefined();
      expect(observabilityConfig({ environment, service, dsn: '' }).dsn).toBeUndefined();
      expect(
        observabilityConfig({
          environment,
          service,
          dsn: 'https://' + publicKey + '@sentry.example.test/12',
        }).dsn,
      ).toContain('sentry.example.test');
    }
  },
);
it.each(['development', 'test'] as const)(
  'SEC-003: a real loopback collector is allowed only locally',
  (environment) => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(
        observabilityConfig({
          environment,
          service: 'api',
          dsn: 'http://' + publicKey + '@' + host + ':9001/12',
        }).dsn,
      ).toContain(':9001/12');
    }
  },
);
it.each([
  'not-a-url',
  'ftp://' + publicKey + '@example.test/12',
  'http://' + publicKey + '@example.test/12',
  'https://invalid@example.test/12',
  'https://' + publicKey + ':private-password@example.test/12',
  'https://' + publicKey + '@example.test/private-path',
  'https://' + publicKey + '@example.test/12?token=private-value',
  'https://' + publicKey + '@example.test/12#private-value',
])('SEC-003: unsafe destinations and credentials fail without reflecting values', (dsn) => {
  expect(() => observabilityConfig({ environment: 'test', service: 'api', dsn })).toThrow(
    'Invalid observability configuration',
  );
});
it.each(['staging', 'production'] as const)(
  'SEC-003: deployed telemetry refuses even loopback HTTP',
  (environment) => {
    expect(() =>
      observabilityConfig({
        environment,
        service: 'api',
        dsn: 'http://' + publicKey + '@localhost/12',
      }),
    ).toThrow('Invalid observability configuration');
  },
);
it('SEC-003: unknown environment, service, fields and input fail closed', () => {
  for (const input of [
    null,
    {},
    { environment: 'preview', service: 'api' },
    { environment: 'test', service: 'unknown' },
    { environment: 'test', service: 'api', password: 'private-value' },
  ]) {
    expect(() => observabilityConfig(input)).toThrow('Invalid observability configuration');
  }
});
