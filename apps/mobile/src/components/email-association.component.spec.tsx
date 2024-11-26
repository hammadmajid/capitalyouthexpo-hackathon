/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  requestEmailAssociation,
  verifyEmailAssociation,
  checkEmailAssociation,
} from '@hsm/api-client';
import { EmailAssociation } from './email-association';
jest.mock('../lib/runtime', () => ({ client: {} }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  requestEmailAssociation: jest.fn(),
  verifyEmailAssociation: jest.fn(),
  checkEmailAssociation: jest.fn(),
}));
const id = '550e8400-e29b-41d4-a716-446655440000';
const profile = {
  user: {
    id,
    fullName: 'Manager',
    email: 'manager@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requestEmailAssociation).mockResolvedValue('manager@example.test');
  jest.mocked(verifyEmailAssociation).mockResolvedValue(profile);
  jest.mocked(checkEmailAssociation).mockResolvedValue(profile);
});
async function mount() {
  const onVerified = jest.fn().mockResolvedValue(undefined);
  const q = await render(<EmailAssociation userId={id} onVerified={onVerified} />);
  return { ...q, onVerified };
}
async function request() {
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'manager@example.test');
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'Permanent manager phrase');
  await fireEvent.press(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByLabelText('Email verification code');
}
test('AUTH-M CHG-006: native association clears password before proof and refreshes the original identity', async () => {
  const q = await mount();
  await request();
  expect(screen.queryByLabelText('Current password')).toBeNull();
  expect(requestEmailAssociation).toHaveBeenCalledWith(
    {},
    { email: 'manager@example.test', currentPassword: 'Permanent manager phrase' },
  );
  await fireEvent.changeText(screen.getByLabelText('Email verification code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(q.onVerified).toHaveBeenCalledWith(profile));
  expect(verifyEmailAssociation).toHaveBeenCalledWith({}, id, 'manager@example.test', '123456');
});
test('SEC: native request failure is safe and never enters proof', async () => {
  const q = await mount();
  jest
    .mocked(requestEmailAssociation)
    .mockRejectedValueOnce(new Error('Private provider credential'));
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'manager@example.test');
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'Permanent manager phrase');
  await fireEvent.press(screen.getByRole('button', { name: 'Send verification code' }));
  expect((await screen.findByRole('alert')).props.children).not.toContain(
    'Private provider credential',
  );
  expect(screen.queryByLabelText('Email verification code')).toBeNull();
  expect(q.onVerified).not.toHaveBeenCalled();
});
test('SEC: native lost-response check reads fresh self profile; restart discards password and proof', async () => {
  const q = await mount();
  await request();
  await fireEvent.changeText(screen.getByLabelText('Email verification code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Check verification status' }));
  await waitFor(() => expect(q.onVerified).toHaveBeenCalledWith(profile));
  expect(checkEmailAssociation).toHaveBeenCalledWith({}, id, 'manager@example.test');
  expect(verifyEmailAssociation).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Request a new code' }));
  expect(screen.queryByLabelText('Email verification code')).toBeNull();
  expect(screen.getByLabelText('Current password').props.value).toBe('');
  expect(screen.getByLabelText('Email address').props.value).toBe('');
});
test('SEC: failed native status check cannot complete association or expose private details', async () => {
  const q = await mount();
  await request();
  jest.mocked(checkEmailAssociation).mockRejectedValueOnce(new Error('Private identity detail'));
  await fireEvent.press(screen.getByRole('button', { name: 'Check verification status' }));
  expect((await screen.findByRole('alert')).props.children).not.toContain(
    'Private identity detail',
  );
  expect(q.onVerified).not.toHaveBeenCalled();
});

test('SEC: unmounted native association cannot apply a delayed verification to another session', async () => {
  const q = await mount();
  await request();
  let resolve: (value: typeof profile) => void = () => undefined;
  jest.mocked(verifyEmailAssociation).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await fireEvent.changeText(screen.getByLabelText('Email verification code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(verifyEmailAssociation).toHaveBeenCalled());
  await q.unmount();
  resolve(profile);
  await Promise.resolve();
  expect(q.onVerified).not.toHaveBeenCalled();
});
