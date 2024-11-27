import { useState, type EffectCallback, type ReactNode } from 'react';
import { AppState, Text, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStaffPages, useStaffRecord } from './staff-data';
import { useAdminCommand } from './data';
import { AdminAccess } from './access';
import { Button } from '../ui';
const actor = '10000000-0000-4000-8000-000000000001';
const mockProfile = { user: { id: actor }, capabilities: { admin: { isRoot: true, roles: [] } } };
let mockFocused = true;
const mockRestore = jest.fn();
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: mockRestore }),
}));
jest.mock('../../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('expo-router', () => ({
  useFocusEffect: (work: EffectCallback) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => (mockFocused ? work() : undefined), [work, mockFocused]);
  },
  router: { back: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));
let value = 'Pending';
const load = jest.fn(async () => ({ data: [{ name: value }], nextCursor: null }));
const count = jest.fn(async () => (value === 'Pending' ? 1 : 0));
function Fixture() {
  const rows = useStaffPages('verification', load, { status: 'pending' });
  const dashboard = useStaffRecord('home-overview', 'today', count);
  const snapshots = useStaffRecord('explorer-summary', 'current', count);
  const command = useAdminCommand('automatic-data-test', async () => {
    value = 'Approved';
  });
  const [search, setSearch] = useState('');
  return (
    <>
      <TextInput accessibilityLabel="Saved search" value={search} onChangeText={setSearch} />
      {rows.rows.map((row) => (
        <Text key={row.name}>{row.name}</Text>
      ))}
      <Text>Dashboard {dashboard.record ?? 'loading'}</Text>
      <Text>Snapshots {snapshots.record ?? 'loading'}</Text>
      <Button label="Approve fixture" onPress={() => command.mutate(null)} />
    </>
  );
}
async function mount(node = <Fixture />) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrap = (content: ReactNode) => (
    <QueryClientProvider client={cache}>{content}</QueryClientProvider>
  );
  return { cache, wrap, ...(await render(wrap(node))) };
}
beforeEach(() => {
  mockFocused = true;
  value = 'Pending';
  jest.clearAllMocks();
  mockRestore.mockResolvedValue(mockProfile);
});
it('HMA-017: loaded records remain visible while an automatic update is pending', async () => {
  const { cache } = await mount();
  await screen.findByText('Pending');
  let done: ((page: Awaited<ReturnType<typeof load>>) => void) | undefined;
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  let pending: Promise<void> | undefined;
  await act(() => {
    pending = cache.invalidateQueries({ queryKey: ['platform-admin', actor] });
  });
  expect(screen.getByText('Pending')).toBeTruthy();
  await act(async () => {
    done?.({ data: [{ name: 'Approved' }], nextCursor: null });
    await pending;
  });
  await screen.findByText('Approved');
});
it('HMA-017: a successful nested command synchronizes directory, dashboard and snapshots in the actor scope', async () => {
  const { cache } = await mount();
  await screen.findByText('Pending');
  cache.setQueryDefaults(['platform-admin', 'other-actor'], { gcTime: Infinity });
  cache.setQueryData(['platform-admin', 'other-actor'], 'Private other actor');
  await fireEvent.press(screen.getByRole('button', { name: 'Approve fixture' }));
  await screen.findByText('Approved');
  await screen.findByText('Dashboard 0');
  await screen.findByText('Snapshots 0');
  expect(cache.getQueryState(['platform-admin', 'other-actor'])?.isInvalidated).toBe(false);
});
it('HMA-017: blurred queries pause; returning refetches current data and preserves local search', async () => {
  const { cache, rerender, wrap } = await mount();
  await screen.findByText('Pending');
  await fireEvent.changeText(screen.getByLabelText('Saved search'), 'Branch A');
  mockFocused = false;
  await rerender(wrap(<Fixture />));
  const calls = load.mock.calls.length;
  value = 'Approved';
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['platform-admin', actor] });
  });
  expect(load).toHaveBeenCalledTimes(calls);
  mockFocused = true;
  await rerender(wrap(<Fixture />));
  await screen.findByText('Approved');
  expect(screen.getByLabelText('Saved search').props.value).toBe('Branch A');
});
it('ADM-001: navigation keeps the authorized subtree mounted while permissions are rechecked', async () => {
  function Child() {
    const [q, setQ] = useState('');
    return <TextInput accessibilityLabel="Route filter" value={q} onChangeText={setQ} />;
  }
  const { rerender, wrap } = await mount(
    <AdminAccess>
      <Child />
    </AdminAccess>,
  );
  await screen.findByLabelText('Route filter');
  await fireEvent.changeText(screen.getByLabelText('Route filter'), 'approved');
  mockFocused = false;
  await rerender(
    wrap(
      <AdminAccess>
        <Child />
      </AdminAccess>,
    ),
  );
  mockFocused = true;
  await rerender(
    wrap(
      <AdminAccess>
        <Child />
      </AdminAccess>,
    ),
  );
  await waitFor(() => expect(screen.getByLabelText('Route filter').props.value).toBe('approved'));
});

it('HMA-017: app foreground refetches active data without a timer or manual button', async () => {
  await mount();
  await screen.findByText('Pending');
  await act(() => {
    focusManager.setFocused(false);
  });
  value = 'Approved';
  await act(() => {
    focusManager.setFocused(true);
  });
  await screen.findByText('Approved');
});
it('ADM-001 SEC-003: failed focus authority check removes retained staff content and cache', async () => {
  const { cache, rerender, wrap } = await mount(
    <AdminAccess>
      <Text>Protected staff content</Text>
    </AdminAccess>,
  );
  await screen.findByText('Protected staff content');
  cache.setQueryDefaults(['platform-admin', actor], { gcTime: Infinity });
  cache.setQueryData(['platform-admin', actor, 'private'], 'Retained staff data');
  mockFocused = false;
  await rerender(
    wrap(
      <AdminAccess>
        <Text>Protected staff content</Text>
      </AdminAccess>,
    ),
  );
  mockRestore.mockResolvedValue(undefined);
  mockFocused = true;
  await rerender(
    wrap(
      <AdminAccess>
        <Text>Protected staff content</Text>
      </AdminAccess>,
    ),
  );
  await screen.findByText('Reconnect and retry the access check.');
  expect(screen.queryByText('Protected staff content')).toBeNull();
  expect(cache.getQueriesData({ queryKey: ['platform-admin', actor] })).toHaveLength(0);
});

it('HMA-017: one foreground check reconciles external changes and skips background work', async () => {
  const previous = AppState.currentState;
  AppState.currentState = 'active';
  jest.useFakeTimers();
  const ui = await mount(
    <AdminAccess cacheBoundary>
      <Fixture />
    </AdminAccess>,
  );
  try {
    await screen.findByText('Pending');
    value = 'Approved';
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await screen.findByText('Approved');
    const calls = load.mock.calls.length;
    AppState.currentState = 'background';
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(load).toHaveBeenCalledTimes(calls);
  } finally {
    await ui.unmount();
    jest.useRealTimers();
    AppState.currentState = previous;
  }
});
