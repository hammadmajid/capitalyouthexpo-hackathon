import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiFailure, saveHostel } from '@hsm/api-client';
import { SaveHostelAction } from './save-hostel-action';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  saveHostel: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const state = vi.hoisted(() => ({ pending: false, guest: false, customer: true, error: false }));
const actorId = randomUUID(),
  branchId = randomUUID();
vi.mock('./providers', () => ({
  useSession: () => ({
    isPending: state.pending,
    error: state.error ? new Error('Unavailable') : null,
    data: state.guest
      ? undefined
      : { user: { id: actorId }, capabilities: { customer: state.customer } },
  }),
}));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(state, { pending: false, guest: false, customer: true, error: false });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return render(
    <QueryClientProvider client={cache}>
      <SaveHostelAction branchId={branchId} />
    </QueryClientProvider>,
  );
}
it('ACC-002: pending session cannot issue a Saved command', () => {
  state.pending = true;
  show();
  expect(screen.getByRole('status').textContent).toContain('Checking Saved access');
  expect(saveHostel).not.toHaveBeenCalled();
});
it.each(['guest', 'error'] as const)(
  'AUTH-C: %s access preserves the actual hostel sign-in return path',
  (kind) => {
    state[kind] = true;
    show();
    const link = screen.getByRole('link', { name: 'Sign in to save this hostel' });
    const url = new URL(link.getAttribute('href') ?? '', 'https://example.test');
    expect(url.searchParams.get('returnTo')).toBe('/hostels/' + branchId);
    expect(saveHostel).not.toHaveBeenCalled();
  },
);
it('AUTH-C: an account without Customer capability preserves the hostel return through the profile route', () => {
  state.customer = false;
  show();
  expect(
    screen
      .getByRole('link', { name: 'Complete your Customer profile to save hostels' })
      .getAttribute('href'),
  ).toBe('/app/customer-profile?returnTo=' + encodeURIComponent('/hostels/' + branchId));
  expect(saveHostel).not.toHaveBeenCalled();
});
it('ACC-002: save reports success only after the matching persisted response', async () => {
  let finish: ((result: Awaited<ReturnType<typeof saveHostel>>) => void) | undefined;
  vi.mocked(saveHostel).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Save this hostel' }));
  await waitFor(() => expect(saveHostel).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Hostel saved by the server/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Saving hostel…' }).matches(':disabled')).toBe(true);
  finish?.({ branchId, saved: true });
  await screen.findByText(/Hostel saved by the server/);
  expect(vi.mocked(saveHostel).mock.calls[0]?.slice(0, 3)).toEqual([{}, branchId, true]);
});
it('SEC-003: a mismatched save response cannot show success', async () => {
  vi.mocked(saveHostel).mockResolvedValue({ branchId, saved: false });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Save this hostel' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/Hostel saved by the server/)).toBeNull();
});

it('SEC-003: revoked save authority removes the mutation action', async () => {
  vi.mocked(saveHostel).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Denied',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Save this hostel' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Save this hostel' })).toBeNull();
});
