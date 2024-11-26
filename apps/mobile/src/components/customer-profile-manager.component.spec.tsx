/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CustomerProfileFlow } from './customer-profile-flow';
const mockLogout = jest.fn(async () => undefined);
jest.mock('./providers', () => ({
  useSession: () => ({
    profile: {
      user: { id: 'manager', email: null, emailVerified: false },
      capabilities: {
        customer: false,
        owner: false,
        managerOf: [{ branchId: 'b', branchName: 'Main' }],
        admin: null,
      },
    },
    logout: mockLogout,
    refetch: jest.fn(),
  }),
}));
jest.mock('./use-profile-details', () => ({ useProfileDetails: () => ({}) }));
jest.mock('./email-association', () => ({ EmailAssociation: () => null }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('./frame', () => ({
  Page: ({ onBack, title }: { onBack?: () => void; title: string }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
        <Text>{title}</Text>
      </Pressable>
    );
  },
}));
test('MGRD: Back on a Manager first-time step signs out to login, never the mode chooser', async () => {
  await render(<CustomerProfileFlow forManager />);
  expect(screen.getByText('Verify your email')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(mockLogout).toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalledWith('/account');
});
