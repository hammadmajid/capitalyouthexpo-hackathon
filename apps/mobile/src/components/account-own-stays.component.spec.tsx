import { useEffect as mockUseEffect } from 'react';
/// <reference types="jest" />
import type { ReactNode } from 'react';
import { Text as MockText, View as MockView } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SelfProfile, StaySummary } from '@hsm/contracts';
import {
  createApiClient,
  readCustomerStays,
  readCustomerStay,
  readStaffStays,
  readInventoryAccess,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { AccountWorkspace as Account } from './account-workspace';
const mockSession: { profile: SelfProfile | undefined } = { profile: undefined };
jest.mock('./providers', () => ({ useSession: () => mockSession }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => mockUseEffect(effect, [effect]),
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => <MockText>Sign in required</MockText>,
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readCustomerStays: jest.fn(),
  readCustomerStay: jest.fn(),
  readStaffStays: jest.fn(),
  readInventoryAccess: jest.fn(),
}));
jest.mock('./frame', () => ({
  Page: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
}));
jest.mock('./branches', () => ({ Branches: () => null }));
jest.mock('./inbox', () => ({ Inbox: () => null }));
jest.mock('./email-association', () => ({ EmailAssociation: () => null }));
jest.mock('./customer-bookings', () => ({ CustomerBookings: () => null }));
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
  jest.resetAllMocks();
  mockSession.profile = profile;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.mocked(actorClient).mockResolvedValue(
    createApiClient({
      baseUrl: 'https://example.test',
      authentication: { kind: 'cookie', csrf: () => undefined },
    }),
  );
  jest.mocked(readCustomerStays).mockResolvedValue({ data: [row], nextCursor: null });
  jest.mocked(readCustomerStay).mockResolvedValue({
    ...row,
    bookingId: null,
    contact: { phone: '+923001234567', email: 'private@example.com' },
  });
});
afterEach(() => cache.clear());
function tree() {
  return (
    <QueryClientProvider client={cache}>
      <Account />
    </QueryClientProvider>
  );
}
async function open() {
  await fireEvent.press(screen.getByRole('button', { name: 'My stays' }));
  await screen.findByRole('button', { name: 'View stay for Own private resident' });
}
test('CHG-012 / SEC-003: real native account reader remains lazy and account changes hide previously loaded private contact', async () => {
  const view = await render(tree());
  expect(readCustomerStays).not.toHaveBeenCalled();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Own private resident' }));
  await screen.findByText('Phone: +923001234567');
  mockSession.profile = { ...profile, user: { ...profile.user, id: next } };
  await view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.queryByText(/Phone:/)).toBeNull();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
  jest.mocked(readCustomerStays).mockResolvedValueOnce({ data: [], nextCursor: null });
  await fireEvent.press(screen.getByRole('button', { name: 'My stays' }));
  await screen.findByText('No stays match this view.');
  expect(actorClient).toHaveBeenLastCalledWith(next);
  expect(readStaffStays).not.toHaveBeenCalled();
});
test('CHG-012 / SEC-003: a lost native session removes the real private reader and restoration does not reopen cached data', async () => {
  const view = await render(tree());
  await open();
  mockSession.profile = undefined;
  await view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.queryByRole('button', { name: 'My stays' })).toBeNull();
  expect(screen.getByText('Sign in required')).toBeTruthy();
  mockSession.profile = profile;
  await view.rerender(tree());
  expect(screen.queryByText('Own private resident')).toBeNull();
  expect(screen.getByRole('button', { name: 'My stays' })).toBeTruthy();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
});
test('CHG-012 / ACC-004: native staff space switching never converts own reads into branch financial or directory access', async () => {
  await render(tree());
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Manager' }));
  expect(screen.getByRole('button', { name: 'View stay for Own private resident' })).toBeTruthy();
  expect(readCustomerStays).toHaveBeenCalledTimes(1);
  expect(readStaffStays).not.toHaveBeenCalled();
  expect(readInventoryAccess).not.toHaveBeenCalled();
  expect(actorClient).toHaveBeenCalledWith(id);
});
