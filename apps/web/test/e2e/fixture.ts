import { test as base, expect } from '@playwright/test';
import { authStack } from '@hsm/test-support';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test port unavailable');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
type BrowserStack = Awaited<ReturnType<typeof authStack>> & { origin: string };
async function browserStack(): Promise<BrowserStack> {
  const port = await availablePort();
  const origin = 'http://127.0.0.1:' + port;
  // Every scenario shares this worker-scoped stack as one loopback client; a larger global
  // budget models many users. Real limits stay covered by the API rate-limit suites.
  const stack = await authStack(origin, {
    GLOBAL_RATE_LIMIT: '2000',
    ...(process.env.HSM_TEST_PROFILE_REVIEWS === 'true' ? { PROFILE_REVIEWS_ENABLED: 'true' } : {}),
  });
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../../.next/standalone/apps/web/server.js', import.meta.url))],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_ENV: 'test',
        API_ORIGIN: new URL(stack.apiUrl).origin,
        WEB_ORIGIN: origin,
        WEB_UPLOAD_ORIGIN: new URL(stack.storage.env.S3_ENDPOINT).origin,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', () => undefined);
  child.stderr?.on('data', () => undefined);
  async function close() {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill('SIGTERM');
      });
    }
    await stack.close();
  }
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null) throw new Error('Web process exited before readiness');
          try {
            return (await fetch(origin + '/login', { signal: AbortSignal.timeout(2000) })).status;
          } catch {
            return 0;
          }
        },
        { timeout: 30000, intervals: [200, 500] },
      )
      .toBe(200);
    return { ...stack, origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}
export const test = base.extend<object, { stack: Awaited<ReturnType<typeof browserStack>> }>({
  stack: [
    async ({ browserName }, use) => {
      expect(browserName).toBe('chromium');
      const stack = await browserStack();
      try {
        await use(stack);
      } finally {
        await stack.close();
      }
    },
    { scope: 'worker', timeout: 240000 },
  ],
  baseURL: async ({ stack }, use) => use(stack.origin),
});
export { expect };
