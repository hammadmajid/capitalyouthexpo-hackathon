import { useEffect as mockUseEffect } from 'react';
/// <reference types="jest" />
import type { ReactNode } from 'react';
import { Text as MockText, View as MockView } from 'react-native';
import { cleanup, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SelfProfile } from '@hsm/contracts';
import { AccountWorkspace as Account } from './account-workspace';
const mockStay = jest.fn((props: { actorId: string; branchId?: string }) => {
  void props;
});
const mockSession: { profile: SelfProfile | undefined } = { profile: undefined };
jest.mock('./providers', () => ({ useSession: () => mockSession }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => mockUseEffect(effect, [effect]),
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));
jest.mock('./stay-directory', () => ({
  StayDirectory: (props: { actorId: string; branchId?: string }) => {
    mockStay(props);
    return <MockText>My stays</MockText>;
  },
}));
jest.mock('./frame', () => ({
  Page: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
}));
jest.mock('./branches', () => ({ Branches: () => null }));
jest.mock('./inbox', () => ({ Inbox: () => null }));
jest.mock('./email-association', () => ({ EmailAssociation: () => null }));
jest.mock('./customer-bookings', () => ({ CustomerBookings: () => null }));
jest.mock('./visits', () => ({ Visits: () => null }));
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
beforeEach(() => jest.clearAllMocks());
const caches: QueryClient[] = [];
async function showAccount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  await render(
    <QueryClientProvider client={client}>
      <Account />
    </QueryClientProvider>,
  );
}
afterEach(async () => {
  await cleanup();
  for (const client of caches.splice(0)) client.clear();
});
test.each(['owner', 'manager', 'customer', 'none'] as const)(
  'STAY-001 / SEC-003: native %s account can reach its own lazy Stay reader without opening bookings',
  async (capability) => {
    mockSession.profile = {
      ...profile,
      capabilities: {
        ...profile.capabilities,
        owner: capability === 'owner',
        customer: capability === 'customer',
        managerOf:
          capability === 'manager' ? [{ branchId: profile.user.id, branchName: 'Branch' }] : [],
      },
    };
    await showAccount();
    expect(screen.getAllByText('My stays')).toHaveLength(1);
    expect(mockStay).toHaveBeenCalledWith({ actorId: profile.user.id });
  },
);
test('SEC-003: an absent native session exposes no private Stay reader', async () => {
  mockSession.profile = undefined;
  await showAccount();
  expect(screen.queryByText('My stays')).toBeNull();
  expect(mockStay).not.toHaveBeenCalled();
});
