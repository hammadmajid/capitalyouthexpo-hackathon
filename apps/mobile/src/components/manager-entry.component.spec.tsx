/// <reference types="jest" />
import { render, screen } from '@testing-library/react-native';
import Manager from '../app/manager';
let mockCustomer = false;
jest.mock('../components/providers', () => ({
  useSession: () => ({
    profile: {
      user: { id: 'manager' },
      capabilities: {
        customer: mockCustomer,
        owner: false,
        managerOf: [{ branchId: 'branch', branchName: 'Main branch' }],
        admin: null,
      },
    },
  }),
}));
jest.mock('../components/manager-home', () => ({
  ManagerHome: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Manager home</Text>;
  },
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{'Redirect ' + JSON.stringify(href)}</Text>;
  },
}));
test('MGRD: a Manager without a completed profile completes it before the dashboard', async () => {
  mockCustomer = false;
  await render(<Manager />);
  expect(
    screen.getByText(
      'Redirect ' + JSON.stringify({ pathname: '/customer-profile', params: { from: 'manager' } }),
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Manager home')).toBeNull();
});
test('MGRD: a Manager with a completed profile opens the dashboard', async () => {
  mockCustomer = true;
  await render(<Manager />);
  expect(screen.getByText('Manager home')).toBeTruthy();
});
