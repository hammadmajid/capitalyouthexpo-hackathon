/// <reference types="jest" />
import type { ReactNode } from 'react';
import { render as renderNative, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SelfProfile } from '@hsm/contracts';
import { router } from 'expo-router';
import { AccountModes } from './account-modes';
import { rememberMode } from '../lib/owner-mode';
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../lib/owner-mode', () => ({ rememberMode: jest.fn(async () => undefined) }));
function render(children: ReactNode) {
  return renderNative(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 900 },
        insets: { top: 24, right: 0, bottom: 24, left: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>,
  );
}
const profile: SelfProfile = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    fullName: '',
    email: 'new@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
beforeEach(() => jest.clearAllMocks());
test('AUTH-C OWN-001: a new identity sees exactly two modes and each opens its existing onboarding', async () => {
  const options = jest.fn();
  await render(<AccountModes profile={profile} onOptions={options} />);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByText('HSM')).toBeNull();
  expect(screen.queryByText('HOSTEL MARKETPLACE')).toBeNull();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Customer Mode' }));
  expect(router.push).toHaveBeenCalledWith('/customer-profile');
  await user.press(screen.getByRole('button', { name: 'Owner Mode' }));
  expect(router.push).toHaveBeenCalledWith('/owner-profile');
  expect(rememberMode).not.toHaveBeenCalled();
  expect(screen.queryByText('My bookings')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  expect(options).not.toHaveBeenCalled();
});
test.each(['customer', 'owner'] as const)(
  'AUTH-C OWN-001: completed %s mode remembers and opens its dashboard',
  async (mode) => {
    await render(
      <AccountModes
        profile={{ ...profile, capabilities: { ...profile.capabilities, [mode]: true } }}
        onOptions={jest.fn()}
      />,
    );
    await userEvent
      .setup()
      .press(
        screen.getByRole('button', { name: mode === 'customer' ? 'Customer Mode' : 'Owner Mode' }),
      );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(mode === 'customer' ? '/marketplace' : '/owner'),
    );
    expect(rememberMode).toHaveBeenCalledWith(profile.user.id, mode);
  },
);
test('SEC-001: unverified identities stay in existing verification options instead of entering a role', async () => {
  const options = jest.fn();
  await render(
    <AccountModes
      profile={{ ...profile, user: { ...profile.user, emailVerified: false } }}
      onOptions={options}
    />,
  );
  await userEvent.setup().press(screen.getByRole('button', { name: 'Owner Mode' }));
  expect(options).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
