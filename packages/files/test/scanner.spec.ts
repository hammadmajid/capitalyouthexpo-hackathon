import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { ClamScanner } from '../src/index.js';
let container: StartedTestContainer, scanner: ClamScanner;
beforeAll(async () => {
  container = await new GenericContainer('clamav/clamav:1.5.4')
    .withEnvironment({ CLAMAV_NO_FRESHCLAMD: 'true' })
    .withExposedPorts(3310)
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(180000)
    .start();
  scanner = new ClamScanner({ host: container.getHost(), port: container.getMappedPort(3310) });
});
afterAll(async () => {
  await container?.stop();
});
it('SEC-003: actual ClamAV reports clean content', async () => {
  expect(await scanner.scan(Buffer.from('%PDF-1.7\nclean scanner fixture\n'))).toBe('clean');
});
it('SEC-003: actual ClamAV rejects the standard benign antivirus test signature', async () => {
  const signature = Buffer.from(
    // eslint-disable-next-line no-secrets/no-secrets -- Public EICAR antivirus test signature encoded to avoid local antivirus quarantine; not a credential.
    'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
    'base64',
  );
  expect(await scanner.scan(signature)).toBe('rejected');
});
