import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SelfProfile } from '@hsm/contracts';
import { Shell } from './shell';
const fixture = vi.hoisted(() => ({
  session: {
    data: undefined as SelfProfile | undefined,
    isPending: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  stay: vi.fn<(props: { actorId: string; branchId?: string }) => void>(),
}));
vi.mock('./providers', () => ({ useSession: () => fixture.session }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('./stay-directory', () => ({
  StayDirectory: (props: { actorId: string; branchId?: string }) => {
    fixture.stay(props);
    return <button>My stays</button>;
  },
}));
vi.mock('./branches', () => ({ Branches: () => null }));
vi.mock('./owner-setup', () => ({ OwnerSetup: () => null }));
vi.mock('./email-association', () => ({ EmailAssociation: () => null }));
vi.mock('./saved-hostels', () => ({ SavedHostels: () => null }));
vi.mock('./customer-bookings', () => ({ CustomerBookings: () => null }));
vi.mock('./booking-policy-settings', () => ({ BookingPolicySettings: () => null }));
const profile: SelfProfile = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    fullName: 'Linked account',
    email: null,
    emailVerified: false,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.session.isPending = false;
  fixture.session.error = null;
});
function show() {
  const cache = new QueryClient();
  return render(
    <QueryClientProvider client={cache}>
      <Shell />
    </QueryClientProvider>,
  );
}
it.each(['owner', 'manager', 'customer', 'none'] as const)(
  'STAY-001 / SEC-003: %s account can open its own lazy Stay reader without Customer eligibility',
  (capability) => {
    fixture.session.data = {
      ...profile,
      capabilities: {
        ...profile.capabilities,
        owner: capability === 'owner',
        customer: capability === 'customer',
        managerOf:
          capability === 'manager' ? [{ branchId: profile.user.id, branchName: 'Branch' }] : [],
      },
    };
    show();
    expect(screen.getAllByRole('button', { name: 'My stays' })).toHaveLength(1);
    expect(fixture.stay).toHaveBeenCalledWith({ actorId: profile.user.id });
  },
);
it.each(['restoring', 'rejected', 'missing'] as const)(
  'SEC-003: %s session never renders a private Stay reader from cached identity',
  (state) => {
    fixture.session.data = state === 'missing' ? undefined : profile;
    fixture.session.isPending = state === 'restoring';
    fixture.session.error = state === 'rejected' ? new Error('Unavailable') : null;
    show();
    expect(screen.queryByRole('button', { name: 'My stays' })).toBeNull();
    expect(fixture.stay).not.toHaveBeenCalled();
  },
);
