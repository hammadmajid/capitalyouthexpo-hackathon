import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiFailure } from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { Shell } from './shell';
const fixture = vi.hoisted(() => ({
  session: {
    data: undefined as SelfProfile | undefined,
    isPending: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  replace: vi.fn(),
}));
vi.mock('./providers', () => ({ useSession: () => fixture.session }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: fixture.replace }) }));
vi.mock('./stay-directory', () => ({ StayDirectory: () => null }));
vi.mock('./branches', () => ({ Branches: () => null }));
vi.mock('./owner-setup', () => ({ OwnerSetup: () => null }));
vi.mock('./email-association', () => ({ EmailAssociation: () => null }));
vi.mock('./saved-hostels', () => ({ SavedHostels: () => null }));
vi.mock('./customer-bookings', () => ({ CustomerBookings: () => null }));
vi.mock('./booking-policy-settings', () => ({ BookingPolicySettings: () => null }));
vi.mock('./inbox', () => ({ Inbox: () => null }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('SEC-001: a completed sign-out goes to plain login even when the session then turns 401', async () => {
  fixture.session.data = {
    user: {
      id: '10000000-0000-4000-8000-000000000001',
      fullName: 'Signed in person',
      email: 'person@example.test',
      emailVerified: true,
      cnicLast4: null,
    },
    capabilities: { customer: true, owner: false, managerOf: [], admin: null },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ revoked: true })),
  );
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <Shell />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(fixture.replace).toHaveBeenCalledWith('/login'));
  fixture.session.error = new ApiFailure({
    type: 'about:blank',
    title: 'Unauthenticated',
    status: 401,
    code: 'UNAUTHENTICATED',
    detail: 'Signed out',
    traceId: '10000000-0000-4000-8000-000000000002',
  });
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <Shell />
    </QueryClientProvider>,
  );
  expect(fixture.replace).toHaveBeenCalledTimes(1);
});
