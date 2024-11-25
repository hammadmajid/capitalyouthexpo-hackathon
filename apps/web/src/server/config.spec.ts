// @vitest-environment node
import { expect, it } from 'vitest';
import { webConfig, privateUploadOrigin } from './config';
it('SEC-001: local web defaults are usable without container infrastructure', () => {
  expect(webConfig({})).toMatchObject({
    APP_ENV: 'development',
    API_ORIGIN: 'http://127.0.0.1:4000',
    WEB_ORIGIN: 'http://localhost:3000',
  });
  expect(Object.isFrozen(webConfig({}))).toBe(true);
});
it.each([
  'ftp://example.com',
  'not a URL',
  'https://[invalid',
  'http://user:PRIVATE@example.com',
  'https://example.com/path',
  'https://example.com?key=PRIVATE',
  'https://example.com#PRIVATE',
])('SEC-001: API origins cannot contain credentials or routing overrides', (API_ORIGIN) => {
  expect(() => webConfig({ API_ORIGIN })).toThrow('Invalid web configuration: API_ORIGIN');
  try {
    webConfig({ API_ORIGIN });
  } catch (error) {
    expect((error as Error).message).not.toContain('PRIVATE');
  }
});
it.each(['staging', 'production'])('SEC-001: deployed web origins require HTTPS', (APP_ENV) => {
  expect(() => webConfig({ APP_ENV })).toThrow();
  expect(
    webConfig({
      APP_ENV,
      API_ORIGIN: 'https://api.example.com',
      WEB_ORIGIN: 'https://app.example.com',
    }).APP_ENV,
  ).toBe(APP_ENV);
});
it('SEC-001: malformed environment kinds are rejected', () => {
  expect(() => webConfig({ APP_ENV: 'unknown' })).toThrow();
});

it('AUTH-C CHG-006 SEC: private upload origin is optional, exact and HTTPS in deployed environments', () => {
  expect(privateUploadOrigin(undefined, 'production')).toBeUndefined();
  expect(privateUploadOrigin('', 'development')).toBeUndefined();
  expect(privateUploadOrigin('http://localhost:9000', 'development')).toBe('http://localhost:9000');
  expect(privateUploadOrigin('https://storage.example.test', 'production')).toBe(
    'https://storage.example.test',
  );
  expect(() => privateUploadOrigin('http://localhost:9000', 'staging')).toThrow(
    'Invalid private upload origin',
  );
});
it.each([
  'https://user:PRIVATE@storage.example.test',
  'https://storage.example.test/path',
  'https://storage.example.test?signature=PRIVATE',
  'https://storage.example.test#PRIVATE',
  'https://storage.example.test/; connect-src *',
  'file:///PRIVATE',
  {},
])('SEC: invalid storage origin is rejected without private input in errors', (origin) => {
  expect(() => privateUploadOrigin(origin, 'production')).toThrow('Invalid private upload origin');
});
