import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { timedFetch } from './fetch';
const native = createRequire(createRequire(import.meta.url).resolve('react-native/package.json'));
const polyfill = native('abort-controller/dist/abort-controller') as {
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('SEC-001: native requests work without AbortSignal.timeout', async () => {
  vi.stubGlobal('AbortController', polyfill.AbortController);
  vi.stubGlobal('AbortSignal', polyfill.AbortSignal);
  const response = new Response('ok');
  const transport: typeof fetch = async (_request, init) => {
    expect(init?.signal).toBeInstanceOf(polyfill.AbortSignal);
    return response;
  };
  expect(await timedFetch(transport)('https://api.example.com')).toBe(response);
});
it('SEC-001: timeout cancels native transport and clears its timer', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('AbortController', polyfill.AbortController);
  const transport: typeof fetch = async (_request, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
    });
  const pending = expect(timedFetch(transport, 100)('https://api.example.com')).rejects.toThrow(
    'Cancelled',
  );
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
it.each([false, true])(
  'SEC-001: caller cancellation is preserved (already aborted: %s)',
  async (already) => {
    vi.stubGlobal('AbortController', polyfill.AbortController);
    const caller = new AbortController();
    if (already) caller.abort();
    const transport: typeof fetch = async (_request, init) => {
      if (!already) caller.abort();
      expect(init?.signal?.aborted).toBe(true);
      return new Response('ok');
    };
    await timedFetch(transport)('https://api.example.com', { signal: caller.signal });
  },
);
it('SEC-001: Request cancellation is preserved and failures clean up timers', async () => {
  vi.useFakeTimers();
  const caller = new AbortController();
  const request = new Request('https://api.example.com', { signal: caller.signal });
  const transport: typeof fetch = async (_request, init) => {
    caller.abort();
    expect(init?.signal?.aborted).toBe(true);
    throw new Error('Offline');
  };
  await expect(timedFetch(transport)(request)).rejects.toThrow('Offline');
  expect(vi.getTimerCount()).toBe(0);
});
