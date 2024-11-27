import { expect, it } from 'vitest';
import { validateMobileConfig } from './config';
it.each(['development', 'test', 'staging', 'production'])(
  'SEC-001: validates %s public configuration',
  (environment) => {
    expect(
      validateMobileConfig({
        environment,
        apiUrl: 'https://api.example.com',
        webUrl: 'https://web.example.com',
      }).apiUrl,
    ).toBe('https://api.example.com');
  },
);
it.each([
  'http://api.example.com',
  'https://user:password@api.example.com',
  'https://api.example.com/v1',
  'https://api.example.com?token=secret',
  'https://api.example.com#token',
  'ftp://api.example.com',
  'invalid',
])('SEC-001: rejects unsafe deployed origins without disclosure', (apiUrl) => {
  expect(() =>
    validateMobileConfig({ environment: 'production', apiUrl, webUrl: 'https://web.example.com' }),
  ).toThrow('Invalid public mobile configuration');
});
it.each([
  'http://example.com',
  'https://user:private@example.com',
  'https://example.com/path',
  'https://example.com?profile=private',
  'ftp://example.com',
])('SEC-001: rejects unsafe deployed public share origin', (webUrl) => {
  expect(() =>
    validateMobileConfig({ environment: 'production', apiUrl: 'https://api.example.com', webUrl }),
  ).toThrow('Invalid public mobile configuration');
});
it('SEC-001: deployed native sharing requires an explicitly configured HTTPS web origin', () => {
  expect(() =>
    validateMobileConfig({ environment: 'production', apiUrl: 'https://api.example.com' }),
  ).toThrow();
});
it('SEC-001: rejects unknown environment and fields without echoing input', () => {
  expect(() => validateMobileConfig({ environment: 'invalid', apiUrl: 'secret' })).toThrow(
    'Invalid public mobile configuration',
  );
  expect(() =>
    validateMobileConfig({ environment: 'test', apiUrl: 'http://localhost:4000', secret: 'value' }),
  ).toThrow();
  expect(
    Object.isFrozen(validateMobileConfig({ environment: 'test', apiUrl: 'http://localhost:4000' })),
  ).toBe(true);
});
