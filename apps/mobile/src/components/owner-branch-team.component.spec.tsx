/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { removeOwnerManager, listOwnerManagers } from '@hsm/api-client';
import { OwnerBranchTeam } from './owner-branch-team';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn(async () => ({})) }));
jest.mock('../lib/fresh-session', () => ({ withFreshSession: (run: () => unknown) => run() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000009' }));
jest.mock('./owner-manager-reset', () => ({ OwnerManagerReset: () => null }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  listOwnerManagers: jest.fn(),
  removeOwnerManager: jest.fn(),
}));
const branch = '550e8400-e29b-41d4-a716-446655440000';
const pending = '550e8400-e29b-41d4-a716-446655440001';
const active = '550e8400-e29b-41d4-a716-446655440002';
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listOwnerManagers).mockResolvedValue({
    data: [
      {
        id: pending,
        userId: pending,
        branchId: branch,
        fullName: 'Pending Manager',
        status: 'pending_activation',
      },
      {
        id: active,
        userId: active,
        branchId: branch,
        fullName: 'Active Manager',
        status: 'active',
      },
    ],
    nextCursor: null,
  });
  jest
    .mocked(removeOwnerManager)
    .mockResolvedValue({ id: pending, branchId: branch, status: 'deactivated' });
});
async function mount() {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <OwnerBranchTeam actorId="owner" branchId={branch} />
    </QueryClientProvider>,
  );
  await screen.findByText('Pending Manager');
}
test('AUTH-M-006: a pending invitation is cancelled only after Yes, for that assignment', async () => {
  await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Cancel invitation for Pending Manager' }),
  );
  expect(screen.getByText('Cancel this invitation? It cannot be undone.')).toBeTruthy();
  expect(removeOwnerManager).not.toHaveBeenCalled();
  // AUTH-M-006: the Owner confirms with their own password.
  await fireEvent.changeText(screen.getByLabelText('Your password'), 'Owner password 1');
  await fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel' }));
  await waitFor(() =>
    expect(removeOwnerManager).toHaveBeenCalledWith({}, branch, pending, 'Owner password 1'),
  );
  await waitFor(() => expect(listOwnerManagers).toHaveBeenCalledTimes(2));
});
test('AUTH-M-006: No keeps the invitation and active managers have no cancel button', async () => {
  await mount();
  expect(screen.queryByRole('button', { name: 'Cancel invitation for Active Manager' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'New password for Active Manager' })).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Cancel invitation for Pending Manager' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'No' }));
  expect(screen.queryByText('Cancel this invitation? It cannot be undone.')).toBeNull();
  expect(removeOwnerManager).not.toHaveBeenCalled();
});
test('AUTH-M-006: a cancelled or removed manager leaves no card or name behind', async () => {
  jest.mocked(listOwnerManagers).mockResolvedValue({
    data: [
      {
        id: pending,
        userId: pending,
        branchId: branch,
        fullName: 'Pending Manager',
        status: 'pending_activation',
      },
      {
        id: active,
        userId: active,
        branchId: branch,
        fullName: 'Gone Manager',
        status: 'deactivated',
      },
    ],
    nextCursor: null,
  });
  await mount();
  expect(screen.queryByText('Gone Manager')).toBeNull();
  expect(screen.queryByText('Removed')).toBeNull();
});
test('CHG-029: there is no permission picker; an activated Manager runs the whole branch', async () => {
  await mount();
  expect(screen.queryByRole('button', { name: 'Permissions for Pending Manager' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Permissions for Active Manager' })).toBeNull();
});
test('AUTH-M-006: an active manager is removed only with the Owner password', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Active Manager' }));
  expect(
    screen.getByText('Remove Active Manager? Their access ends now and cannot be undone.'),
  ).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Your password'), 'Owner password 1');
  await fireEvent.press(screen.getByRole('button', { name: 'Yes, remove' }));
  await waitFor(() =>
    expect(removeOwnerManager).toHaveBeenCalledWith({}, branch, active, 'Owner password 1'),
  );
});
test('AUTH-M-006: a wrong Owner password is named and nothing is removed', async () => {
  const { ApiFailure } = jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client');
  jest.mocked(removeOwnerManager).mockRejectedValueOnce(
    new ApiFailure({
      type: 'https://example.com/problem',
      title: 'Bad request',
      detail: 'Incorrect password',
      status: 400,
      code: 'VALIDATION_FAILED',
      traceId: 'trace',
    }),
  );
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Active Manager' }));
  await fireEvent.changeText(screen.getByLabelText('Your password'), 'Wrong password 1');
  await fireEvent.press(screen.getByRole('button', { name: 'Yes, remove' }));
  expect(await screen.findByText('Incorrect password. Try again.')).toBeTruthy();
  expect(screen.getByText('Active Manager')).toBeTruthy();
});
