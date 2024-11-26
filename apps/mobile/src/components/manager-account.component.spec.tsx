/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ManagerAccount } from './manager-account';
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ManagerAccount />
    </SafeAreaProvider>,
  );
const mockProfile = {
  user: { id: 'manager', fullName: 'Ali Manager', emailVerified: true },
  capabilities: {
    customer: true,
    owner: false,
    managerOf: [{ branchId: 'branch', branchName: 'Main branch' }],
    admin: null,
  },
};
jest.mock('./providers', () => ({
  useSession: () => ({ profile: mockProfile, logout: jest.fn() }),
}));
jest.mock('./visual-surfaces', () => ({ NatureBackground: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../lib/owner-mode', () => ({ rememberMode: jest.fn(async () => undefined) }));
jest.mock('./marketplace/customer-account-sections', () => ({
  CustomerAccountSection: ({ section }: { section: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{'Section ' + section}</Text>;
  },
}));
beforeEach(() => jest.clearAllMocks());
test('MGRD / ACC-002: Manager Account lists profile, security, switching, branch, support and sign out', async () => {
  await mount();
  for (const name of [
    'Profile',
    'Account security',
    'Switch to Customer',
    'Main branch',
    'Help & support',
    'Terms and conditions',
    'Privacy Policy',
  ])
    expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText('Sign out')).toBeTruthy();
  expect(screen.queryByText('Switch to Owner')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Account' }).props.accessibilityState).toEqual({
    selected: true,
  });
});
test('MGRD: Switch to Customer opens the marketplace and support opens in place', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Switch to Customer'));
  expect(router.replace).toHaveBeenCalledWith('/marketplace');
  await fireEvent.press(screen.getByText('Terms and conditions'));
  expect(screen.getByText('Section Terms and conditions')).toBeTruthy();
});
test('MGRD: the bottom tabs reach Dashboard, Operations and Residents', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('tab', { name: 'Operations' }));
  expect(router.replace).toHaveBeenCalledWith('/manager-operations');
  await fireEvent.press(screen.getByRole('tab', { name: 'Residents' }));
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/manager-branch',
    params: { branchId: 'branch', tool: 'stays', tab: 'residents' },
  });
  await fireEvent.press(screen.getByRole('tab', { name: 'Dashboard' }));
  expect(router.replace).toHaveBeenCalledWith('/manager');
});
