import { expect, it } from 'vitest';
import { storageConfig } from './config.js';
const input = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test-secret-long-enough',
  S3_PRIVATE_BUCKET: 'hsm-private',
};
it('SEC: storage configuration rejects unsafe endpoints and bucket names', () => {
  expect(storageConfig(input).APP_ENV).toBe('development');
  expect(
    storageConfig({ ...input, S3_PUBLIC_ENDPOINT: 'http://localhost:9001' }).S3_PUBLIC_ENDPOINT,
  ).toContain('9001');
  for (const endpoint of [
    'ftp://localhost',
    'http://user:pass@localhost',
    'http://localhost?token=x',
    'http://localhost/#fragment',
  ]) {
    expect(() => storageConfig({ ...input, S3_ENDPOINT: endpoint })).toThrow();
  }
  expect(() => storageConfig({ ...input, S3_PRIVATE_BUCKET: 'Bad Bucket' })).toThrow();
});
it('SEC: both deployed storage endpoints require HTTPS', () => {
  expect(() => storageConfig({ ...input, APP_ENV: 'production' })).toThrow();
  expect(() =>
    storageConfig({
      ...input,
      APP_ENV: 'staging',
      S3_ENDPOINT: 'https://storage.test',
      S3_PUBLIC_ENDPOINT: 'http://public.test',
    }),
  ).toThrow();
  expect(
    storageConfig({ ...input, APP_ENV: 'production', S3_ENDPOINT: 'https://storage.test' }).APP_ENV,
  ).toBe('production');
});
