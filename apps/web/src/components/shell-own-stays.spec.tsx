import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SelfProfile, StaySummary } from '@hsm/contracts';
import {
  readCustomerStays,
  readCustomerStay,
  readInventoryAccess,
  readStaffStays,
} from '@hsm/api-client';
import { Shell } from './shell';
const state = vi.hoisted(() => ({
  profile: undefined as SelfProfile | undefined,
  error: null as unknown,
}));
vi.mock('./providers', () => ({
  useSession: () => ({
    data: state.profile,
    error: state.error,
    isPending: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readCustomerStays: vi.fn(),
  readCustomerStay: vi.fn(),
  readInventoryAccess: vi.fn(),
  readStaffStays: vi.fn(),
}));
vi.mock('./branches', () => ({ Branches: () => null }));
vi.mock('./owner-setup', () => ({ OwnerSetup: () => null }));
vi.mock('./email-association', () => ({ EmailAssociation: () => null }));
vi.mock('./saved-hostels', () => ({ SavedHostels: () => null }));
vi.mock('./customer-bookings', () => ({ CustomerBookings: () => null }));
vi.mock('./booking-policy-settings', () => ({ BookingPolicySettings: () => null }));
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const profile: SelfProfile = {
  user: {
    id,
    fullName: 'Linked staff account',
    email: null,
    emailVerified: false,
    cnicLast4: null,
  },
  capabilities: {
    customer: false,
    owner: true,
    managerOf: [{ branchId: id, branchName: 'Staff branch' }],
    admin: null,
  },
};
const row: StaySummary = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Own private resident',
  source: 'manual',
  state: 'active',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: '2028-02-01T06:00:00.000Z',
  closedAt: null,
  currentAssignment: null,
};
let cache: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  state.profile = profile;
  state.error = null;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.mocked(readCustomerStays).mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(readCustomerStay).mockResolvedValue({
    ...row,
    bookingId: null,
    contact: { phone: '+923001234567', email: 'private@example.com' },
  });
});
afterEach(() => {
  cleanup();
  cache.clear();
});
function tree(context: 'owner' | 'manager' = 'owner') {
  return (
    <QueryClientProvider client={cache}>
      <Shell context={context} />
    </QueryClientProvider>
  );
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'My stays' }));
  const reader = await screen.findByRole('region', { name: 'My stays' });
  await within(reader).findByRole('button', { name: 'View stay for Own private resident' });
  return reader;
}
it('CHG-012 / SEC-003: actual account reader is lazy and changing accounts discards previously loaded private directory and contact', async () => {
  const view = render(tree());
  expect(readCustomerStays).not.toHaveBeenCalled();
  const reader = await open();
  fireEvent.click(
    within(reader).getByRole('button', { name: 'View stay for Own private resident' }),
  );
  await within(reader).findByText('Phone: +923001234567');
  state.profile = { ...profile, user: { ...profile.user, id: next } };
  view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.queryByText(/Phone:/)).toBeNull();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
  vi.mocked(readCustomerStays).mockResolvedValueOnce({ data: [], nextCursor: null });
  fireEvent.click(screen.getByRole('button', { name: 'My stays' }));
  await screen.findByText('No stays match this view.');
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(readStaffStays).not.toHaveBeenCalled();
});
it('CHG-012 / SEC-003: rejected session unmounts the actual own reader; restoration requires a fresh explicit open', async () => {
  const view = render(tree());
  await open();
  state.error = new Error('Session refresh unavailable');
  view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.queryByRole('button', { name: 'My stays' })).toBeNull();
  state.error = null;
  view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.getByRole('button', { name: 'My stays' })).toBeTruthy();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
});
it('CHG-012 / ACC-004: switching staff spaces keeps the own relationship separate from branch directory permission', async () => {
  const view = render(tree());
  await open();
  view.rerender(tree('manager'));
  expect(screen.getByRole('button', { name: 'View stay for Own private resident' })).toBeTruthy();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
  expect(readStaffStays).not.toHaveBeenCalled();
  expect(readInventoryAccess).not.toHaveBeenCalled();
});
