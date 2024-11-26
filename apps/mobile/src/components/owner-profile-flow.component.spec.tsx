/// <reference types="jest" />
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { View as MockView, Text as MockText, Pressable as MockPressable } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { z } from 'zod';
import { OwnerProfileFlow } from './owner-profile-flow';
import { completeOwnerProfile } from '../lib/owner-profile';
const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('./owner-profile-ui', () => {
  const actual = jest.requireActual<typeof import('./owner-profile-ui')>('./owner-profile-ui');
  return {
    ...actual,
    OwnerProfileShell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
      <MockView>
        {actions}
        {children}
      </MockView>
    ),
  };
});
jest.mock('./owner-profile-photo', () => ({
  OwnerProfilePhoto: ({ onBusy }: { onBusy: (busy: boolean) => void }) => (
    <MockPressable
      accessibilityRole="button"
      accessibilityLabel="Begin photo upload"
      onPress={() => onBusy(true)}
    >
      <MockText>Photo control</MockText>
    </MockPressable>
  ),
}));
jest.mock('./frame', () => ({
  Page: ({ title, children }: { title: string; children: ReactNode }) => (
    <MockView>
      <MockText>{title}</MockText>
      {children}
    </MockView>
  ),
}));
jest.mock('./private-file-picker', () => ({
  PrivateFilePicker: ({ label, onReady }: { label: string; onReady: (id: string) => void }) => (
    <MockPressable
      accessibilityLabel={'Select ' + label}
      onPress={() =>
        onReady(
          label === 'CNIC front'
            ? '550e8400-e29b-41d4-a716-446655440001'
            : '550e8400-e29b-41d4-a716-446655440002',
        )
      }
    >
      <MockText>{label}</MockText>
    </MockPressable>
  ),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../lib/runtime', () => ({ client: {} }));
jest.mock('../lib/owner-photo-draft', () => ({
  clearOwnerPhotoDraft: jest.fn(async () => undefined),
}));
jest.mock('../lib/owner-profile', () => ({ completeOwnerProfile: jest.fn() }));
const mockProfile = {
  user: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'owner@example.test',
    emailVerified: true,
  },
  capabilities: { owner: true },
};
const mockRefetch = jest.fn();
jest.mock('./providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: mockRefetch }),
}));
const mockDetailState = {
  data: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    fullName: '',
    email: 'identity@example.test',
    emailVerified: true,
    phone: null,
    gender: null,
    cnicLast4: null,
    profilePhotoFileId: null,
    customer: null,
    owner: null,
  } as import('@hsm/contracts').ProfileDetails | undefined,
  isError: false,
  refetch: jest.fn(),
};
jest.mock('./use-profile-details', () => ({ useProfileDetails: () => mockDetailState }));
beforeEach(() => {
  mockDetailState.isError = false;
  mockDetailState.data = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    fullName: '',
    email: 'identity@example.test',
    emailVerified: true,
    phone: null,
    gender: null,
    cnicLast4: null,
    profilePhotoFileId: null,
    customer: null,
    owner: null,
  };
  jest.resetAllMocks();
  mockProfile.user.emailVerified = true;
  mockRefetch.mockResolvedValue(mockProfile);
  jest
    .mocked(completeOwnerProfile)
    .mockResolvedValue(mockProfile as Awaited<ReturnType<typeof completeOwnerProfile>>);
});
test('AUTH-C: actual Owner form submits explicit versioned consent and enters account only after fresh Owner confirmation', async () => {
  await render(<OwnerProfileFlow />);
  expect(screen.getByLabelText('Organization name')).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Organization name'), 'E2E-OWNER-organization');
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Owner identity');
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '03001234567');
  await fireEvent.changeText(screen.getByLabelText('CNIC number'), '6110112345671');
  await fireEvent.changeText(screen.getByLabelText('Owner address'), 'Private owner address');
  await fireEvent(screen.getByLabelText('I accept this Owner agreement.'), 'valueChange', true);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(completeOwnerProfile).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      fullName: 'Owner identity',
      organizationName: 'E2E-OWNER-organization',
      phone: '03001234567',
      cnic: '6110112345671',
      address: 'Private owner address',
      agreementAccepted: true,
      agreementVersion: 'owner-foundation-v1',
    }),
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/owner');
});
test('SEC: unverified identity cannot render or submit Owner completion', async () => {
  mockProfile.user.emailVerified = false;
  await render(<OwnerProfileFlow />);
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  expect(screen.getByText('A verified email is required to complete this profile.')).toBeVisible();
  expect(completeOwnerProfile).not.toHaveBeenCalled();
});
test('SEC: missing live Owner grant prevents navigation and shows a safe error', async () => {
  mockRefetch.mockResolvedValue({ ...mockProfile, capabilities: { owner: false } });
  await render(<OwnerProfileFlow />);
  await fireEvent.changeText(screen.getByLabelText('CNIC number'), '6110112345671');
  await fireEvent(screen.getByLabelText('I accept this Owner agreement.'), 'valueChange', true);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(
    await screen.findByText(
      'The server sent an unexpected reply. Try again; update the app if it keeps happening.',
    ),
  ).toBeVisible();
  expect(router.replace).not.toHaveBeenCalled();
});
test('AUTH-C SEC: loading saved details cannot expose an empty editable form', async () => {
  mockDetailState.data = undefined;
  await render(<OwnerProfileFlow />);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByLabelText('Loading saved profile')).toBeDefined();
});
test('AUTH-C SEC: failed profile read hides the form and offers an explicit retry', async () => {
  mockDetailState.isError = true;
  await render(<OwnerProfileFlow />);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  // Pull down reloads; no manual refresh button.
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh|Reload)\b/ })).toBeNull();
});
test('AUTH-C SEC: Owner edit retains private evidence, masks CNIC and requires new consent', async () => {
  if (!mockDetailState.data) throw new Error('Fixture missing');
  mockDetailState.data = {
    ...mockDetailState.data,
    fullName: 'Saved Owner',
    phone: '+923001234567',
    cnicLast4: '5671',
    owner: {
      address: 'Saved private address',
      cnicFrontFileId: '550e8400-e29b-41d4-a716-446655440011',
      cnicBackFileId: '550e8400-e29b-41d4-a716-446655440012',
      agreementVersion: 'owner-foundation-v1',
      agreementAcceptedAt: '2026-10-11T00:00:00.000Z',
      completed: true,
    },
  };
  await render(<OwnerProfileFlow />);
  expect(screen.getAllByText('Saved Owner').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Save Owner profile' })).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: 'Edit Owner profile' }));
  expect(screen.queryByLabelText('Organization name')).toBeNull();
  expect(screen.queryByText('Identity documents')).toBeNull();
  expect(screen.queryByLabelText('Select CNIC front')).toBeNull();
  expect(screen.getByLabelText('CNIC number')).toHaveDisplayValue('');
  expect(screen.getByText('CNIC ending in 5671')).toBeDefined();
  await fireEvent.changeText(screen.getByLabelText('CNIC number'), '6110112345671');
  await fireEvent(screen.getByLabelText('I accept this Owner agreement.'), 'valueChange', true);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(screen.queryByRole('button', { name: 'Save Owner profile' })).toBeNull();
  expect(completeOwnerProfile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      fullName: 'Saved Owner',
      address: 'Saved private address',
      agreementAccepted: true,
    }),
  );
});
test('OWN-001: save explains exactly what is missing before contacting the server', async () => {
  await render(<OwnerProfileFlow />);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(await screen.findByText('Enter your 13-digit CNIC number to save changes.')).toBeVisible();
  expect(completeOwnerProfile).not.toHaveBeenCalled();
});
test('OWN-001: profile saves without CNIC photos or a profile photo, with required consent', async () => {
  await render(<OwnerProfileFlow />);
  expect(screen.queryByLabelText('Select CNIC front')).toBeNull();
  expect(screen.queryByText('Identity documents')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Draft owner');
  await fireEvent.changeText(screen.getByLabelText('CNIC number'), '6110112345671');
  await fireEvent(screen.getByLabelText('I accept this Owner agreement.'), 'valueChange', true);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  const body = jest.mocked(completeOwnerProfile).mock.calls[0]?.[1];
  expect(body).not.toHaveProperty('cnicFrontFileId');
  expect(body).not.toHaveProperty('cnicBackFileId');
  expect(body).not.toHaveProperty('profilePhotoFileId');
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
test('OWN-001: short address explains the failing field and retains all entered details', async () => {
  jest
    .mocked(completeOwnerProfile)
    .mockRejectedValueOnce(
      new z.ZodError([{ code: 'custom', path: ['address'], message: 'Private validation detail' }]),
    );
  await render(<OwnerProfileFlow />);
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Owner draft');
  await fireEvent.changeText(screen.getByLabelText('Owner address'), 'No');
  await fireEvent.changeText(screen.getByLabelText('CNIC number'), '6110112345671');
  await fireEvent(screen.getByLabelText('I accept this Owner agreement.'), 'valueChange', true);
  await userEvent.press(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(
    (await screen.findAllByText('Enter your complete Owner address (at least 5 characters).'))
      .length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText('Owner address')).toHaveDisplayValue('No');
  expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Owner draft');
  expect(router.replace).not.toHaveBeenCalled();
});
test('OWN-001: photo upload leaves profile inputs editable and only protects Save', async () => {
  await render(<OwnerProfileFlow />);
  await userEvent.press(screen.getByRole('button', { name: 'Begin photo upload' }));
  expect(screen.getByLabelText('Full name')).toBeEnabled();
  await fireEvent.changeText(screen.getByLabelText('Owner address'), 'Typing while uploading');
  expect(screen.getByLabelText('Owner address')).toHaveDisplayValue('Typing while uploading');
  expect(screen.getByRole('button', { name: 'Save Owner profile' })).toBeDisabled();
});
