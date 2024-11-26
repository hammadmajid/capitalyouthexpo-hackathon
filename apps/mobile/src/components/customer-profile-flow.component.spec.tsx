import { rememberMode } from '../lib/owner-mode';
import { AppHeader as MockHeader } from './navigation/header';
/// <reference types="jest" />
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { View as MockView } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { CustomerProfileFlow } from './customer-profile-flow';
import { ApiFailure, submitProfileReview } from '@hsm/api-client';
import { completeCustomerProfile } from '../lib/customer-profile';
const mockPhotoId = '550e8400-e29b-41d4-a716-446655440013';
jest.mock('./private-file-picker', () => ({
  PrivateFilePicker: ({
    Action,
    label,
    onReady,
  }: {
    Action: typeof import('./ui').Button;
    label: string;
    onReady: (id: string) => void;
  }) => <Action label={'Choose ' + label} onPress={() => onReady(mockPhotoId)} />,
}));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readOwnFileUrl: jest.fn(async () => ({ url: 'https://example.test/profile-photo' })),
  submitProfileReview: jest.fn(async () => ({})),
}));
jest.mock('./frame', () => ({
  Page: ({
    title,
    children,
    backTo,
  }: {
    title: string;
    children: ReactNode;
    backTo?: import('expo-router').Href;
  }) => (
    <MockView>
      <MockHeader title={title} {...(backTo ? { backTo } : {})} />
      {children}
    </MockView>
  ),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn(async () => ({})) }));
jest.mock('../lib/owner-mode', () => ({ rememberMode: jest.fn(async () => undefined) }));
jest.mock('../lib/customer-profile', () => ({ completeCustomerProfile: jest.fn() }));
const mockRefetch = jest.fn();
const mockIdentity: import('@hsm/contracts').SelfProfile = {
  user: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'identity@example.test',
    emailVerified: true,
    fullName: '',
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
jest.mock('./providers', () => ({
  useSession: () => ({ profile: mockIdentity, refetch: mockRefetch }),
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
  delete mockIdentity.features;
  mockIdentity.capabilities.admin = null;
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
  jest.clearAllMocks();
  jest.mocked(completeCustomerProfile).mockResolvedValue({
    user: { ...mockIdentity.user, fullName: 'Saved identity', cnicLast4: null },
    capabilities: { customer: true, owner: false, managerOf: [], admin: null },
  });
  mockIdentity.user.emailVerified = true;
});

test.each([null, { isRoot: true, roles: [] }])(
  'AUTH-C: Customer photo saves directly with profile reviews enabled and Admin capability %p',
  async (admin) => {
    mockIdentity.features = { profileReviews: true };
    mockIdentity.capabilities.admin = admin;
    await render(<CustomerProfileFlow />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose profile photo' }));
    await fill(user);
    await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
    expect(completeCustomerProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ profilePhotoFileId: mockPhotoId }),
    );
    expect(submitProfileReview).not.toHaveBeenCalled();
  },
);
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Customer identity');
  await user.type(screen.getByLabelText('Mobile number'), '03001234567');
  await user.type(screen.getByLabelText('Age (18 or older)'), '22');
  await user.press(screen.getByRole('button', { name: 'female' }));
}
test('AUTH-C CHG-006: actual Customer form requests adult age without birth date, emergency contact or CNIC', async () => {
  await render(<CustomerProfileFlow />);
  const user = userEvent.setup();
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  expect(screen.queryByLabelText('Date of birth')).toBeNull();
  expect(screen.getByText('identity@example.test')).toBeVisible();
  expect(screen.getByLabelText('Mobile number')).toBeVisible();
  await fill(user);
  await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(completeCustomerProfile).toHaveBeenCalledWith(
    { client: {}, refetch: mockRefetch },
    {
      fullName: 'Customer identity',
      phone: '03001234567',
      age: '22',
      gender: 'female',
      institution: '',
    },
  );
  expect(rememberMode).toHaveBeenCalledWith(mockIdentity.user.id, 'customer');
  expect(router.replace).toHaveBeenCalledWith('/marketplace');
});
test('SEC: an unverified email cannot render or submit the completion form', async () => {
  mockIdentity.user.emailVerified = false;
  await render(<CustomerProfileFlow />);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByText('A verified email is required to complete this profile.')).toBeVisible();
  expect(completeCustomerProfile).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledWith('/account');
});
test('SEC: failed save or capability confirmation stays on the form with a safe error', async () => {
  jest
    .mocked(completeCustomerProfile)
    .mockRejectedValueOnce(new Error('private profile provider value'));
  await render(<CustomerProfileFlow />);
  const user = userEvent.setup();
  await fill(user);
  await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(screen.queryByText('private profile provider value')).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Age (18 or older)')).toHaveDisplayValue('22');
});

test('AUTH-C SEC: loading saved details cannot expose an empty editable form', async () => {
  mockDetailState.data = undefined;
  await render(<CustomerProfileFlow />);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByLabelText('Loading your saved profile…')).toBeDefined();
});
test('AUTH-C SEC: failed profile read hides the form and offers an explicit retry', async () => {
  mockDetailState.isError = true;
  await render(<CustomerProfileFlow />);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  // Pull down reloads; no manual refresh button.
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh|Reload)\b/ })).toBeNull();
});
test('AUTH-C CHG-006: saved ordinary values prefill and adult age remains editable', async () => {
  if (!mockDetailState.data) throw new Error('Fixture missing');
  mockDetailState.data = {
    ...mockDetailState.data,
    fullName: 'Saved identity',
    phone: '+923001234567',
    gender: 'female',
    profilePhotoFileId: '550e8400-e29b-41d4-a716-446655440013',
    customer: { age: 24, institution: 'Saved institution', completed: true },
  };
  await render(<CustomerProfileFlow />);
  expect(screen.getByText('Saved identity')).toBeVisible();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
  expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Saved identity');
  await fireEvent.changeText(screen.getByLabelText('Age (18 or older)'), '25');
  await userEvent.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(completeCustomerProfile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      fullName: 'Saved identity',
      phone: '+923001234567',
      age: '25',
      institution: 'Saved institution',
      profilePhotoFileId: '550e8400-e29b-41d4-a716-446655440013',
    }),
  );
});

test('AUTH-C: Account saves in place and Edit reopens the latest persisted values', async () => {
  mockDetailState.refetch.mockImplementationOnce(async () => {
    if (!mockDetailState.data) throw new Error('Missing fixture');
    mockDetailState.data = {
      ...mockDetailState.data,
      fullName: 'Customer identity',
      gender: 'female',
      phone: '+923001234567',
      customer: { age: 22, institution: null, completed: true },
    };
  });
  const mounted = await render(<CustomerProfileFlow fromAccount />);
  const user = userEvent.setup();
  await fill(user);
  await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(await screen.findByText('Profile saved')).toBeVisible();
  await mounted.rerender(<CustomerProfileFlow fromAccount />);
  expect(screen.getByText('+923001234567')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  expect(screen.queryByLabelText('Mobile number')).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Edit profile' }));
  expect(screen.getByLabelText('Mobile number')).toHaveDisplayValue('+923001234567');
});

test('AUTH-C SEC: the edit form accepts name and gender changes for server validation', async () => {
  if (!mockDetailState.data) throw new Error('Missing fixture');
  mockDetailState.data = { ...mockDetailState.data, fullName: 'Saved identity', gender: 'female' };
  await render(<CustomerProfileFlow />);
  expect(screen.getByLabelText('Full name')).toHaveProp('editable', true);
  expect(screen.getByRole('button', { name: 'female' })).toBeEnabled();
  const male = screen.getByRole('button', { name: 'male' });
  expect(male).toBeEnabled();
  await userEvent.press(male);
  expect(screen.getByRole('button', { name: 'male', selected: true })).toBeVisible();
});
test('AUTH-C: an identity review conflict explains the next step without exposing raw diagnostics', async () => {
  jest.mocked(completeCustomerProfile).mockRejectedValueOnce(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Conflict',
      status: 409,
      code: 'CONFLICT',
      detail: 'Identity correction requires review',
      traceId: 'fixture',
    }),
  );
  await render(<CustomerProfileFlow />);
  const user = userEvent.setup();
  await fill(user);
  await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(
    await screen.findByText(/Name or gender changes require identity review\. Use Profile reviews/),
  ).toBeVisible();
  expect(router.replace).not.toHaveBeenCalled();
});

test('AUTH-C: restoring the saved name preserves the selected photo and other edits', async () => {
  if (!mockDetailState.data) throw new Error('Missing fixture');
  mockDetailState.data = {
    ...mockDetailState.data,
    fullName: 'Saved name',
    phone: '+923001234567',
    gender: 'female',
    customer: { age: 24, institution: null, completed: true },
  };
  await render(<CustomerProfileFlow fromAccount />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Edit profile' }));
  await user.press(screen.getByRole('button', { name: 'Choose profile photo' }));
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Changed name');
  await fireEvent.changeText(screen.getByLabelText('Age (18 or older)'), '25');
  await user.press(screen.getByRole('button', { name: 'Use saved name' }));
  await user.press(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(completeCustomerProfile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ fullName: 'Saved name', age: '25', profilePhotoFileId: mockPhotoId }),
  );
});
