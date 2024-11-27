import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNativeCommand } from './use-command';
jest.mock('../../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest
    .fn()
    .mockReturnValueOnce('10000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('10000000-0000-4000-8000-000000000002')
    .mockReturnValue('10000000-0000-4000-8000-000000000003'),
}));
function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
it('PAY-008 / AUD-003: native response loss retains key and original payload across remount', async () => {
  const client = new QueryClient();
  const run = jest.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue('ok');
  const first = await renderHook(
    () =>
      useNativeCommand('audit:mobile-remount', 'actor-A', run, [['funds', 'actor-A', 'stay-A']]),
    { wrapper: wrapper(client) },
  );
  await act(async () => {
    await expect(first.result.current.mutateAsync({ amountPaisa: 100 })).rejects.toThrow('lost');
  });
  await first.unmount();
  const second = await renderHook(
    () =>
      useNativeCommand('audit:mobile-remount', 'actor-A', run, [['funds', 'actor-A', 'stay-A']]),
    { wrapper: wrapper(client) },
  );
  expect(second.result.current.unresolved).toBe(true);
  await act(async () => {
    await expect(second.result.current.mutateAsync({ amountPaisa: 200 })).rejects.toThrow();
  });
  expect(run).toHaveBeenCalledTimes(1);
  await act(async () => {
    second.result.current.retryOriginal();
  });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]?.slice(1)).toEqual(run.mock.calls[0]?.slice(1));
});
it('SEC-001 / AUD-003: switching native accounts cannot borrow the previous actor intent', async () => {
  const client = new QueryClient(),
    run = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok');
  const hook = await renderHook(
    ({ actor }: { actor: string }) =>
      useNativeCommand('audit:mobile-actor', actor, run, [['funds', actor, 'stay-A']]),
    { initialProps: { actor: 'actor-A' }, wrapper: wrapper(client) },
  );
  await act(async () => {
    await expect(hook.result.current.mutateAsync(null)).rejects.toThrow();
  });
  await hook.rerender({ actor: 'actor-B' });
  expect(hook.result.current.unresolved).toBe(false);
  await act(async () => {
    await hook.result.current.mutateAsync(null);
  });
  await hook.rerender({ actor: 'actor-A' });
  expect(hook.result.current.unresolved).toBe(true);
  await act(async () => {
    await hook.result.current.mutateAsync(null);
  });
  expect(run.mock.calls[2]?.[2]).toBe(run.mock.calls[0]?.[2]);
  expect(run.mock.calls[1]?.[2]).not.toBe(run.mock.calls[0]?.[2]);
});
