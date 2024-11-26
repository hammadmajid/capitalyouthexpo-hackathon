import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useCommand } from './use-command';

const refresh = [['audit-command', 'actor-A', 'stay-A']];
function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
it('PAY-008 / AUD-003: retry after a committed command loses its response retains the exact key', async () => {
  const client = new QueryClient();
  const run = vi
    .fn()
    .mockRejectedValueOnce(new Error('Response lost after commit'))
    .mockResolvedValue({ id: 'once' });
  const hook = renderHook(() => useCommand('audit:retry', run, refresh), {
    wrapper: wrapper(client),
  });
  const body = { paymentId: 'source', movement: { kind: 'deposit_refund', amountPaisa: 100 } };
  await act(async () => {
    await expect(hook.result.current.mutateAsync(body)).rejects.toThrow();
  });
  await act(async () => {
    await hook.result.current.mutateAsync(body);
  });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]?.[1]).toBe(run.mock.calls[0]?.[1]);
});

it('PAY-008 / AUD-003: an unresolved command cannot be replaced with an altered amount', async () => {
  const client = new QueryClient();
  const run = vi
    .fn()
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValue({ id: 'wrong-new-intent' });
  const hook = renderHook(() => useCommand('audit:edited', run, refresh), {
    wrapper: wrapper(client),
  });
  await act(async () => {
    await expect(hook.result.current.mutateAsync({ amountPaisa: 100 })).rejects.toThrow();
  });
  await act(async () => {
    await expect(hook.result.current.mutateAsync({ amountPaisa: 200 })).rejects.toThrow();
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it('PAY-008 / AUD-003: remount with the same actor and resource preserves an unresolved command', async () => {
  const client = new QueryClient();
  const run = vi
    .fn()
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValue({ id: 'once' });
  const first = renderHook(() => useCommand('audit:remount', run, refresh), {
    wrapper: wrapper(client),
  });
  await act(async () => {
    await expect(first.result.current.mutateAsync({ amountPaisa: 100 })).rejects.toThrow();
  });
  first.unmount();
  const second = renderHook(() => useCommand('audit:remount', run, refresh), {
    wrapper: wrapper(client),
  });
  await act(async () => {
    await second.result.current.mutateAsync({ amountPaisa: 100 });
  });
  expect(run.mock.calls[1]?.[1]).toBe(run.mock.calls[0]?.[1]);
});
