/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OwnerMenu } from './owner-menu';
import { rememberMode } from '../lib/owner-mode';
const mockSession = {
  logout: jest.fn().mockResolvedValue(undefined),
  profile: {
    user: { id: 'u1', fullName: 'Test Owner', email: 'owner@example.test', emailVerified: true },
    capabilities: {
      owner: true,
      customer: false,
      managerOf: [] as { branchId: string; branchName: string }[],
      admin: null as { isRoot: boolean; roles: string[] } | null,
    },
  },
};
jest.mock('./providers', () => ({ useSession: () => mockSession }));
jest.mock('../lib/owner-mode', () => ({
  rememberMode: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.2.3' } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
// The invitation button reads admin data; it is covered by its own tests.
jest.mock('./admin/invitation', () => ({ AdminInvitationEntry: () => null }));
jest.mock('./marketplace/customer-account-sections', () => ({
  CustomerAccountSection: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
beforeEach(() => jest.clearAllMocks());
it('OWN menu: destinations navigate to real screens and close the menu', async () => {
  const close = jest.fn();
  await render(<OwnerMenu open close={close} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Owner Profile' }));
  expect(router.push).toHaveBeenCalledWith('/owner-profile');
  expect(close).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Manager Access & Invitations' }));
  expect(router.push).toHaveBeenCalledWith('/owner-invite');
});
it('OWN menu: customer mode needs a real Customer capability; no role is granted by switching', async () => {
  await render(<OwnerMenu open close={jest.fn()} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Set up Customer Mode. Complete a Customer profile first' }),
  );
  expect(router.push).toHaveBeenCalledWith('/customer-profile');
  expect(rememberMode).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalledWith('/marketplace');
});
it('OWN menu: no dead links are shown, and Delete Account never deletes anything', async () => {
  await render(<OwnerMenu open close={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Privacy Policy' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /Delete Account/ }));
  expect(screen.getByText(/In-app account deletion is not available/)).toBeTruthy();
  expect(mockSession.logout).not.toHaveBeenCalled();
  expect(screen.getByText('Version 1.2.3')).toBeTruthy();
});
it('AUTH: Sign out uses the session logout and returns to the start screen', async () => {
  await render(<OwnerMenu open close={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(mockSession.logout).toHaveBeenCalledWith();
});
it('OWN menu: Spaces is gone; Hostel Setup opens hostels; other roles show only when held', async () => {
  await render(<OwnerMenu open close={jest.fn()} />);
  expect(screen.queryByRole('button', { name: /All spaces/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Manager workspace' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Platform admin' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Hostel Setup' }));
  expect(router.push).toHaveBeenCalledWith('/owner-properties');
});
it('OWN menu: a person who also manages a branch or is an Admin can switch there', async () => {
  mockSession.profile.capabilities.managerOf = [{ branchId: 'b1', branchName: 'Branch' }];
  mockSession.profile.capabilities.admin = { isRoot: false, roles: ['support'] };
  try {
    await render(<OwnerMenu open close={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Manager workspace' }));
    expect(router.push).toHaveBeenCalledWith('/manager');
    await fireEvent.press(screen.getByRole('button', { name: 'Platform admin' }));
    expect(rememberMode).toHaveBeenCalledWith('u1', 'admin');
  } finally {
    mockSession.profile.capabilities.managerOf = [];
    mockSession.profile.capabilities.admin = null;
  }
});

it('UI-001: Owner Account uses the reference sections and preserves every existing destination', async () => {
  await render(<OwnerMenu open close={jest.fn()} />);
  expect(screen.getByText('Business & Setup')).toBeTruthy();
  expect(screen.getByText('Access & Security')).toBeTruthy();
  expect(screen.getByText('Support')).toBeTruthy();
  expect(screen.getByText('Test Owner')).toBeTruthy();
  for (const label of [
    'Owner Profile',
    'Hostel Setup',
    'Manager Access & Invitations',
    'Reports & Analytics',
    'Account & Security',
    'Notifications',
    'Terms and conditions',
    'Privacy Policy',
  ])
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
});

it('UI-001: Back and reference navigation retain real destinations', async () => {
  const close = jest.fn();
  await render(<OwnerMenu open close={close} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Close menu' }));
  expect(close).toHaveBeenCalled();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByRole('tab', { name: 'Account' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByRole('tab', { name: 'Properties' }));
  expect(router.push).toHaveBeenCalledWith('/owner-properties');
  expect(screen.queryByText('Manage hostels, managers, and reports')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
  expect(router.push).toHaveBeenCalledWith('/owner-notifications');
});
