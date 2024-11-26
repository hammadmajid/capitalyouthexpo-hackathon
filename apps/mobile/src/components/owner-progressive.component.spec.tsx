/// <reference types="jest" />
import type { ReactNode } from 'react';
import { View as MockView } from 'react-native';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { OwnerInviteManager } from './owner-invite-manager';
const mockBranch = {
  id: '019a1234-1234-7123-8123-000000000012',
  brandId: '019a1234-1234-7123-8123-000000000011',
  name: 'Main branch',
  verificationStatus: 'draft',
};
const mockHome = {
  loading: false,
  error: null,
  hostels: { data: [{ id: mockBranch.brandId, name: 'Saved Hostel' }] },
  branches: { data: { data: [mockBranch], nextCursor: null }, isError: false, isPending: false },
};
const mockInvite = jest.fn(async () => ({ acceptance: 'authenticated_account' }));
jest.mock('./use-owner-home', () => ({ useOwnerHome: () => mockHome }));
jest.mock('./providers', () => ({
  useSession: () => ({ profile: { user: { id: 'owner' }, capabilities: { owner: true } } }),
}));
jest.mock('./owner-screen', () => ({
  OwnerScreen: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ brandId: mockBranch.brandId }),
}));
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: [] }, isPending: false }),
  useMutation: () => ({ mutate: jest.fn(), reset: jest.fn(), isPending: false, error: null }),
}));
jest.mock('./owner-manager-reset', () => ({ OwnerManagerReset: () => null }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  ownerSetupActions: () => ({ invite: mockInvite, forgetInvitation: jest.fn() }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockHome.branches.data.data = [mockBranch];
});
test('OWN-005: a real draft hostel is selectable and its invitation targets the exact main branch', async () => {
  await render(<OwnerInviteManager />);
  expect(screen.getByLabelText('Saved Hostel - Main branch - Draft')).toBeVisible();
  // The form shows straight away for the chosen branch; no extra "Invite" step.
  expect(screen.queryByRole('button', { name: 'Invite Manager to This Hostel' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Full name *'), 'Manager fixture');
  await fireEvent.changeText(screen.getByLabelText('Mobile number *'), '03001234567');
  // AUTH-M-003: the Owner types the temporary password; there is no toggle or generator.
  expect(screen.queryByLabelText('Set the temporary password myself')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Temporary password *'), 'OwnerSet!778');
  await userEvent.press(screen.getByRole('button', { name: 'Send Invitation' }));
  expect(mockInvite).toHaveBeenCalledWith(
    mockBranch.id,
    expect.objectContaining({
      fullName: 'Manager fixture',
      temporaryCredential: { mode: 'manual', password: 'OwnerSet!778' },
    }),
  );
});
test('OWN-001: no hostel keeps Manager Access informative and does not render an invitation form', async () => {
  mockHome.branches.data.data = [];
  await render(<OwnerInviteManager />);
  expect(screen.getByText(/Save hostel Basic Information first/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Send Invitation' })).toBeNull();
  expect(mockInvite).not.toHaveBeenCalled();
});
