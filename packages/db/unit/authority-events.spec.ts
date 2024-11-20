import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  end: vi.fn(),
  options: undefined as
    | { onclose(): void; onnotify(channel: string, payload: string): void; onnotice(): void }
    | undefined,
}));
vi.mock('postgres', () => ({
  default: (_url: string, options: NonNullable<typeof mocks.options>) => {
    mocks.options = options;
    return { end: mocks.end };
  },
}));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({ execute: mocks.execute }) }));
import { AUTHORITY_CHANGE_CHANNEL, listenAuthorityChanges } from '../src/authority-events.js';
const url = 'postgres://localhost/authority_fixture';
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.options = undefined;
  mocks.execute.mockReset().mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
it('COMM-001 / MGR-004: dedicated listener validates exact committed authority events', async () => {
  const changed = vi.fn(),
    unavailable = vi.fn(),
    listener = await listenAuthorityChanges(url, changed, unavailable);
  expect(listener.available()).toBe(true);
  expect(mocks.execute).toHaveBeenCalledOnce();
  for (const event of [
    { kind: 'user', id: randomUUID() },
    { kind: 'session', id: randomUUID() },
    { kind: 'hierarchy' },
  ]) {
    mocks.options?.onnotify(AUTHORITY_CHANGE_CHANNEL, JSON.stringify(event));
    expect(changed).toHaveBeenLastCalledWith(event);
  }
  mocks.options?.onnotify('unrelated', 'invalid');
  mocks.options?.onnotice();
  expect(unavailable).not.toHaveBeenCalled();
  await listener.close();
  expect(listener.available()).toBe(false);
  mocks.options?.onnotify(AUTHORITY_CHANGE_CHANNEL, '{}');
  mocks.options?.onclose();
  expect(unavailable).not.toHaveBeenCalled();
  expect(mocks.end).toHaveBeenCalledWith({ timeout: 1 });
});
it.each([
  'invalid json',
  '{}',
  JSON.stringify({ kind: 'user', id: randomUUID(), body: 'injected' }),
])('SEC-003: malformed authority notifications invalidate active connections', async (payload) => {
  const changed = vi.fn(),
    unavailable = vi.fn(),
    listener = await listenAuthorityChanges(url, changed, unavailable);
  mocks.options?.onnotify(AUTHORITY_CHANGE_CHANNEL, payload);
  expect(changed).not.toHaveBeenCalled();
  expect(unavailable).toHaveBeenCalledOnce();
  await listener.close();
});
it('SEC-003: listener loss immediately fails closed and reestablishes LISTEN before accepting sockets', async () => {
  const unavailable = vi.fn(),
    listener = await listenAuthorityChanges(url, vi.fn(), unavailable);
  mocks.options?.onclose();
  mocks.options?.onclose();
  expect(listener.available()).toBe(false);
  expect(unavailable).toHaveBeenCalledTimes(2);
  mocks.execute.mockRejectedValueOnce(new Error('offline'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(listener.available()).toBe(false);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(listener.available()).toBe(true);
  expect(mocks.execute).toHaveBeenCalledTimes(3);
  mocks.options?.onclose();
  await listener.close();
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.execute).toHaveBeenCalledTimes(3);
});
it('SEC-003: failed initial LISTEN closes resources and exposes only a sanitized startup error', async () => {
  mocks.execute.mockRejectedValue(new Error('private database details'));
  await expect(listenAuthorityChanges(url, vi.fn(), vi.fn())).rejects.toThrow(
    'AUTHORITY_LISTENER_UNAVAILABLE',
  );
  expect(mocks.end).toHaveBeenCalled();
});
it('SEC-003: an observer error also fails closed', async () => {
  const unavailable = vi.fn(),
    listener = await listenAuthorityChanges(
      url,
      () => {
        throw new Error('observer unavailable');
      },
      unavailable,
    );
  mocks.options?.onnotify(AUTHORITY_CHANGE_CHANNEL, JSON.stringify({ kind: 'hierarchy' }));
  expect(unavailable).toHaveBeenCalledOnce();
  await listener.close();
});
it.each([false, true])(
  'SEC-003: shutdown during reconnect cannot restore availability or schedule more work (%s)',
  async (reject) => {
    const unavailable = vi.fn(),
      listener = await listenAuthorityChanges(url, vi.fn(), unavailable);
    let complete: (() => void) | undefined;
    mocks.execute.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, fail) => {
          complete = () => (reject ? fail(new Error('closed reconnect')) : resolve());
        }),
    );
    mocks.options?.onclose();
    await vi.advanceTimersByTimeAsync(1000);
    await listener.close();
    const calls = unavailable.mock.calls.length;
    complete?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener.available()).toBe(false);
    expect(unavailable).toHaveBeenCalledTimes(calls);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  },
);
