/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { listAdmins } from '@hsm/api-client';
import { AdminWorkspace } from './workspace';
jest.mock('./data', () => ({
  useAdminData: () => ({
    profile: {
      user: { id: 'root', fullName: 'Root' },
      capabilities: { admin: { isRoot: true, roles: [] } },
    },
    key: ['platform-admin', 'root'],
    active: true,
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
}));
jest.mock('../providers', () => ({
  useSession: () => ({ profile: { capabilities: { admin: { isRoot: true, roles: [] } } } }),
}));
jest.mock('../visual-surfaces', () => ({ NatureBackground: () => null }));
jest.mock('./premium-surface', () => ({
  PremiumSurface: () => null,
  premiumShadow: {},
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  listAdmins: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(listAdmins)
    .mockResolvedValue({ data: [], nextCursor: null, totalCount: 2, activeRootCount: 1 } as never);
});
test('ADM-002: Admin management is one simple list with counts and no switching buttons', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <AdminWorkspace />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByRole('button', { name: '2 Admins' });
  expect(screen.getByText('1 of 3 used')).toBeTruthy();
  for (const [name, path] of [
    ['Root seats', '/admin/admins?roots=true'],
    ['Invite Admin', '/admin/admins/invite'],
    ['My profile', '/admin/profile'],
  ] as const) {
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(router.push).toHaveBeenCalledWith(path);
  }
  for (const name of ['All account spaces', 'Switch to Customer', 'Root members'])
    expect(screen.queryByRole('button', { name })).toBeNull();
});
